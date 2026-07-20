"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { resolveCourseIdClient } from "@/lib/supabase/course-context";
import StatChip from "@/components/ui/StatChip";

type Role = "owner" | "superintendent" | "assistant" | "crew_lead" | "crew";

interface Member {
  id: string;
  user_id: string;
  role: Role;
  email: string | null;
  full_name: string | null;
}

const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner",
  superintendent: "Superintendent",
  assistant: "Assistant",
  crew_lead: "Crew Lead",
  crew: "Crew",
};

const ALL_ROLES: Role[] = ["owner", "superintendent", "assistant", "crew_lead", "crew"];
const JUNIOR_ROLES: Role[] = ["assistant", "crew_lead", "crew"];

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
  const [inviting, setInviting] = useState(false);

  async function load() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    setMyUserId(user.id);

    const context = await resolveCourseIdClient(supabase);
    if (!context) {
      setChecking(false);
      return;
    }

    setCourseId(context.courseId);
    setIsAdminView(context.isAdminView);

    const { data: course } = await supabase
      .from("courses")
      .select("name")
      .eq("id", context.courseId)
      .single();
    setCourseName(course?.name ?? "");

    if (!context.isAdminView) {
      const { data: membership } = await supabase
        .from("course_members")
        .select("role")
        .eq("user_id", user.id)
        .eq("course_id", context.courseId)
        .single();
      setMyRole((membership?.role as Role) ?? null);
    }

    const { data: memberRows } = await supabase
      .from("course_members")
      .select("id, user_id, role")
      .eq("course_id", context.courseId);

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
    }));
    merged.sort((a, b) => ALL_ROLES.indexOf(a.role) - ALL_ROLES.indexOf(b.role));

    setMembers(merged);
    setChecking(false);
  }

  useEffect(() => {
    load();
  }, []);

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

    try {
      const res = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole, full_name: inviteName || undefined }),
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
        setShowInviteForm(false);
        await load();
      }
    } catch {
      setError("Something went wrong sending the invite.");
    }
    setInviting(false);
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

      <div className="grid grid-cols-4 gap-3">
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
            className="flex flex-wrap items-end gap-3 px-5 py-4 border-b-[1.5px] border-rule bg-chalk"
          >
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
            <button
              type="submit"
              disabled={inviting}
              className="px-4 py-2 bg-green-mid text-white text-sm font-semibold rounded-lg hover:bg-green-dark transition-colors disabled:opacity-50"
            >
              {inviting ? "Sending..." : "Send Invite"}
            </button>
          </form>
        )}

        {members.length === 0 ? (
          <div className="p-10 text-center">
            <div className="text-4xl mb-3">👥</div>
            <div className="text-sm text-mist">No team members yet.</div>
          </div>
        ) : (
          <table className="w-full text-sm">
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
                return (
                  <tr key={m.id} className="border-b border-rule last:border-0">
                    <td className="px-5 py-2.5 font-medium">
                      {m.full_name || "—"} {isSelf && <span className="text-mist text-xs">(You)</span>}
                    </td>
                    <td className="px-3 py-2.5 text-mist">{m.email ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      {manageable && !isSelf ? (
                        <select
                          value={m.role}
                          onChange={(e) => handleRoleChange(m, e.target.value as Role)}
                          className="px-2 py-1 border-[1.5px] border-rule rounded text-xs outline-none focus:border-green-mid"
                        >
                          {(isAdminView || myRole === "owner" ? ALL_ROLES : JUNIOR_ROLES).map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABEL[r]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-[10px] font-mono uppercase tracking-wide bg-green-pale text-green-mid px-1.5 py-0.5 rounded">
                          {ROLE_LABEL[m.role]}
                        </span>
                      )}
                    </td>
                    {canManage && (
                      <td className="px-5 py-2.5 text-right whitespace-nowrap">
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
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
