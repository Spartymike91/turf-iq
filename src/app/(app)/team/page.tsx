"use client";

import { useState, useEffect, useMemo, Fragment } from "react";
import { createClient } from "@/lib/supabase/client";
import { resolveCourseIdClient } from "@/lib/supabase/course-context";
import StatChip from "@/components/ui/StatChip";
import { ALL_MODULES } from "@/lib/planAccess";
import { type Role, ALL_ROLES, JUNIOR_ROLES, ROLE_LABEL } from "@/lib/roles";

interface Member {
  id: string;
  user_id: string;
  role: Role;
  email: string | null;
  full_name: string | null;
  allowed_modules: string[] | null;
  title: string | null;
}

const ALL_MODULE_SLUGS = ALL_MODULES.map((m) => m.slug);

export default function TeamPage() {
  const [courseId, setCourseId] = useState<string | null>(null);
  const [courseName, setCourseName] = useState("");
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<Role | null>(null);
  const [isAdminView, setIsAdminView] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("crew");
  const [inviteTitle, setInviteTitle] = useState("");
  const [inviteAllowedModules, setInviteAllowedModules] = useState<string[]>(ALL_MODULE_SLUGS);
  const [inviting, setInviting] = useState(false);

  const [editingAccessId, setEditingAccessId] = useState<string | null>(null);
  const [editAccessModules, setEditAccessModules] = useState<string[]>(ALL_MODULE_SLUGS);
  const [editTitle, setEditTitle] = useState("");
  const [savingAccess, setSavingAccess] = useState(false);
  // Bumped after a successful invite to re-run the effect below and refetch
  // the roster — the fetch-and-setState logic has to live inside the effect
  // itself (not called by reference from an outer function) for react-hooks/
  // set-state-in-effect to be able to verify it's effect-local; see the
  // load() nesting pattern already used in DiseaseRiskSection.tsx.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setMyUserId(user.id);

      const context = await resolveCourseIdClient(supabase, user);
      if (!context) {
        setChecking(false);
        return;
      }

      setCourseId(context.courseId);
      setIsAdminView(context.isAdminView);

      // These three only depend on context.courseId/user.id, not on each
      // other — fetch concurrently.
      const [{ data: course }, membershipResult, { data: memberRows }] = await Promise.all([
        supabase.from("courses").select("name").eq("id", context.courseId).single(),
        context.isAdminView
          ? Promise.resolve({ data: null as { role: string } | null })
          : supabase
              .from("course_members")
              .select("role")
              .eq("user_id", user.id)
              .eq("course_id", context.courseId)
              .single(),
        supabase.from("course_members").select("id, user_id, role, allowed_modules, title").eq("course_id", context.courseId),
      ]);
      setCourseName(course?.name ?? "");
      if (!context.isAdminView) {
        setMyRole((membershipResult.data?.role as Role) ?? null);
      }

      const userIds = (memberRows ?? []).map((m) => m.user_id);
      const { data: profileRows } = userIds.length
        ? await supabase.from("profiles").select("id, email, full_name").in("id", userIds)
        : { data: [] };

      const profileById = new Map((profileRows ?? []).map((p) => [p.id, p]));
      const merged: Member[] = (memberRows ?? []).map((m) => ({
        id: m.id,
        user_id: m.user_id,
        role: m.role as Role,
        email: profileById.get(m.user_id)?.email ?? null,
        full_name: profileById.get(m.user_id)?.full_name ?? null,
        allowed_modules: m.allowed_modules,
        title: m.title,
      }));
      merged.sort((a, b) => ALL_ROLES.indexOf(a.role) - ALL_ROLES.indexOf(b.role));

      setMembers(merged);
      setChecking(false);
    }

    load();
  }, [reloadKey]);

  const canManage = isAdminView || myRole === "owner" || myRole === "superintendent";
  const assignableRoles = isAdminView || myRole === "owner" ? ALL_ROLES : JUNIOR_ROLES;

  function canManageRow(m: Member) {
    if (isAdminView || myRole === "owner") return true;
    if (myRole === "superintendent") return JUNIOR_ROLES.includes(m.role);
    return false;
  }

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of members) counts[m.role] = (counts[m.role] ?? 0) + 1;
    return counts;
  }, [members]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail) return;
    setInviting(true);
    setError(null);
    setNotice(null);

    const isRestricted =
      JUNIOR_ROLES.includes(inviteRole) && inviteAllowedModules.length < ALL_MODULE_SLUGS.length;

    try {
      const res = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail,
          role: inviteRole,
          full_name: inviteName || undefined,
          allowed_modules: isRestricted ? inviteAllowedModules : null,
          title: inviteTitle || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to invite.");
      } else {
        setNotice(
          data.mode === "invited_new"
            ? `Invite email sent to ${inviteEmail}.`
            : `${inviteEmail} already has an account — added to your team directly.`
        );
        setInviteName("");
        setInviteEmail("");
        setInviteRole("crew");
        setInviteTitle("");
        setInviteAllowedModules(ALL_MODULE_SLUGS);
        setShowInviteForm(false);
        setReloadKey((k) => k + 1);
      }
    } catch {
      setError("Something went wrong sending the invite.");
    }
    setInviting(false);
  }

  function toggleInviteModule(slug: string) {
    setInviteAllowedModules((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    );
  }

  function startEditAccess(member: Member) {
    setEditingAccessId(member.id);
    setEditAccessModules(member.allowed_modules ?? ALL_MODULE_SLUGS);
    setEditTitle(member.title ?? "");
  }

  function toggleEditAccessModule(slug: string) {
    setEditAccessModules((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    );
  }

  async function handleSaveAccess(member: Member) {
    setSavingAccess(true);
    setError(null);
    const isRestricted = editAccessModules.length < ALL_MODULE_SLUGS.length;
    const resolvedTitle = editTitle.trim() || null;
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("course_members")
      .update({
        allowed_modules: JUNIOR_ROLES.includes(member.role) && isRestricted ? editAccessModules : null,
        title: resolvedTitle,
      })
      .eq("id", member.id);
    if (updateError) {
      setError(updateError.message);
    } else {
      setMembers((prev) =>
        prev.map((m) =>
          m.id === member.id
            ? {
                ...m,
                allowed_modules: JUNIOR_ROLES.includes(member.role) && isRestricted ? editAccessModules : null,
                title: resolvedTitle,
              }
            : m
        )
      );
      setEditingAccessId(null);
    }
    setSavingAccess(false);
  }

  async function handleRoleChange(member: Member, role: Role) {
    setError(null);
    const supabase = createClient();
    const { data, error: updateError } = await supabase
      .from("course_members")
      .update({ role })
      .eq("id", member.id)
      .select()
      .single();
    if (updateError) {
      setError(updateError.message);
    } else if (data) {
      setMembers((prev) => prev.map((m) => (m.id === member.id ? { ...m, role: data.role } : m)));
    }
  }

  async function handleRemove(member: Member) {
    if (!window.confirm(`Remove ${member.full_name || member.email || "this member"} from the team?`)) return;
    setError(null);
    const supabase = createClient();
    const { error: deleteError } = await supabase.from("course_members").delete().eq("id", member.id);
    if (deleteError) {
      setError(deleteError.message);
    } else {
      setMembers((prev) => prev.filter((m) => m.id !== member.id));
    }
  }

  if (checking) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-mist">Loading...</div>
      </div>
    );
  }

  if (!courseId) {
    return (
      <div className="bg-white border-[1.5px] border-rule rounded-[10px] p-6 text-center">
        <div className="font-serif text-xl text-green-dark mb-2">No course found</div>
        <div className="text-sm text-mist">Set up your course profile first.</div>
      </div>
    );
  }

  return (
    <>
      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-green-forest mb-1">Team</div>
        <div className="font-serif text-2xl text-green-dark">Course Team</div>
        <div className="text-[13px] text-mist mt-1">
          {courseName} · {members.length} member{members.length === 1 ? "" : "s"}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatChip label="Total Members" value={String(members.length)} tag="Roster" tagColor="ok" />
        <StatChip label="Owners" value={String(roleCounts.owner ?? 0)} valueColor="#3b5bdb" />
        <StatChip label="Superintendents" value={String(roleCounts.superintendent ?? 0)} />
        <StatChip
          label="Crew"
          value={String((roleCounts.assistant ?? 0) + (roleCounts.crew_lead ?? 0) + (roleCounts.crew ?? 0))}
          sub="Assistants, crew leads, crew"
        />
      </div>

      {notice && (
        <div className="bg-green-pale border-[1.5px] border-green-mid/30 rounded-lg px-4 py-2 text-xs text-green-dark">
          {notice}
        </div>
      )}
      {error && (
        <div className="bg-red/5 border-[1.5px] border-red/40 rounded-lg px-4 py-2 text-xs text-red">{error}</div>
      )}

      <div className="bg-white border-[1.5px] border-rule rounded-[10px] overflow-hidden shrink-0">
        <div className="flex items-center justify-between px-5 py-4 border-b-[1.5px] border-rule">
          <div className="font-serif text-lg text-green-dark">Roster</div>
          {canManage && (
            <button
              onClick={() => setShowInviteForm((v) => !v)}
              className="px-3.5 py-1.5 bg-green-mid text-white text-xs font-semibold rounded-lg hover:bg-green-dark transition-colors"
            >
              {showInviteForm ? "Cancel" : "+ Invite Teammate"}
            </button>
          )}
        </div>

        {canManage && showInviteForm && (
          <form
            onSubmit={handleInvite}
            className="flex flex-col gap-3 px-5 py-4 border-b-[1.5px] border-rule bg-chalk"
          >
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wide">Name</label>
                <input
                  type="text"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="Jordan Reyes"
                  className="px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid focus:ring-2 focus:ring-green-mid/10"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wide">Email</label>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="teammate@example.com"
                  className="px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid focus:ring-2 focus:ring-green-mid/10"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wide">Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as Role)}
                  className="px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid"
                >
                  {assignableRoles.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wide">
                  Title <span className="text-mist font-normal normal-case">(optional)</span>
                </label>
                <input
                  type="text"
                  value={inviteTitle}
                  onChange={(e) => setInviteTitle(e.target.value)}
                  placeholder="Equipment Manager"
                  className="px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid focus:ring-2 focus:ring-green-mid/10"
                />
              </div>
              <button
                type="submit"
                disabled={inviting}
                className="px-4 py-2 bg-green-mid text-white text-sm font-semibold rounded-lg hover:bg-green-dark transition-colors disabled:opacity-50"
              >
                {inviting ? "Sending..." : "Send Invite"}
              </button>
            </div>

            {JUNIOR_ROLES.includes(inviteRole) && (
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wide">
                  Visible Tabs <span className="text-mist font-normal normal-case">— unchecked tabs won&apos;t show for this person</span>
                </label>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                  {ALL_MODULES.map((m) => (
                    <label key={m.slug} className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={inviteAllowedModules.includes(m.slug)}
                        onChange={() => toggleInviteModule(m.slug)}
                      />
                      <span>{m.icon} {m.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </form>
        )}

        {members.length === 0 ? (
          <div className="p-10 text-center">
            <div className="text-4xl mb-3">👥</div>
            <div className="text-sm text-mist">No team members yet.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="text-[10px] font-mono uppercase tracking-wider text-mist border-b border-rule">
                <th className="text-left px-5 py-2.5 font-medium">Member</th>
                <th className="text-left px-3 py-2.5 font-medium">Email</th>
                <th className="text-left px-3 py-2.5 font-medium">Role</th>
                {canManage && <th className="text-right px-5 py-2.5 font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const isSelf = m.user_id === myUserId;
                const manageable = canManageRow(m);
                const editableRow = manageable && !isSelf;
                return (
                  <Fragment key={m.id}>
                  <tr className="border-b border-rule last:border-0">
                    <td className="px-5 py-2.5 font-medium">
                      {m.full_name || "—"} {isSelf && <span className="text-mist text-xs">(You)</span>}
                    </td>
                    <td className="px-3 py-2.5 text-mist">{m.email ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-col gap-1">
                        {m.title && <span className="text-xs font-medium text-ink">{m.title}</span>}
                        {manageable && !isSelf ? (
                          <select
                            value={m.role}
                            onChange={(e) => handleRoleChange(m, e.target.value as Role)}
                            className="px-2 py-1 border-[1.5px] border-rule rounded text-xs outline-none focus:border-green-mid w-fit"
                          >
                            {(isAdminView || myRole === "owner" ? ALL_ROLES : JUNIOR_ROLES).map((r) => (
                              <option key={r} value={r}>
                                {ROLE_LABEL[r]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-[10px] font-mono uppercase tracking-wide bg-green-pale text-green-mid px-1.5 py-0.5 rounded w-fit">
                            {ROLE_LABEL[m.role]}
                          </span>
                        )}
                      </div>
                    </td>
                    {canManage && (
                      <td className="px-5 py-2.5 text-right whitespace-nowrap">
                        {editableRow && (
                          <button
                            onClick={() => (editingAccessId === m.id ? setEditingAccessId(null) : startEditAccess(m))}
                            className="text-mist text-xs font-semibold hover:text-green-dark mr-3"
                          >
                            {editingAccessId === m.id ? "Cancel" : "Edit"}
                          </button>
                        )}
                        {manageable && !isSelf && (
                          <button
                            onClick={() => handleRemove(m)}
                            className="text-mist text-xs font-semibold hover:text-red"
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                  {editingAccessId === m.id && (
                    <tr className="border-b border-rule last:border-0 bg-chalk">
                      <td colSpan={canManage ? 4 : 3} className="px-5 py-4">
                        <div className="flex flex-col gap-3">
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[11px] font-semibold uppercase tracking-wide text-mist">
                              Title for {m.full_name || m.email}{" "}
                              <span className="font-normal normal-case">(optional — shown instead of the role name above)</span>
                            </label>
                            <input
                              type="text"
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              placeholder="Equipment Manager"
                              className="px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid focus:ring-2 focus:ring-green-mid/10 max-w-xs"
                            />
                          </div>
                          {JUNIOR_ROLES.includes(m.role) && (
                            <div className="flex flex-col gap-1.5">
                              <div className="text-[11px] font-semibold uppercase tracking-wide text-mist">
                                Visible tabs
                              </div>
                              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                                {ALL_MODULES.map((mod) => (
                                  <label key={mod.slug} className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      checked={editAccessModules.includes(mod.slug)}
                                      onChange={() => toggleEditAccessModule(mod.slug)}
                                    />
                                    <span>{mod.icon} {mod.label}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          )}
                          <div>
                            <button
                              onClick={() => handleSaveAccess(m)}
                              disabled={savingAccess}
                              className="px-3 py-1.5 bg-green-mid text-white text-xs font-semibold rounded-lg hover:bg-green-dark transition-colors disabled:opacity-50"
                            >
                              {savingAccess ? "Saving..." : "Save"}
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </>
  );
}
