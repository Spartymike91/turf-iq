"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { resolveCourseIdClient } from "@/lib/supabase/course-context";
import ChatNotificationsToggle from "@/components/chat/ChatNotificationsToggle";

interface Roster {
  courseMemberId: string;
  name: string;
}

interface AdminThread {
  id: string;
  kind: "general" | "dm";
  label: string;
}

interface ChatMessage {
  id: string;
  thread_id: string;
  sender_id: string | null;
  body: string;
  created_at: string;
}

const MAX_LEN = 2000;

export default function ChatPage() {
  const [supabase] = useState(() => createClient());
  const [checking, setChecking] = useState(true);
  const [isAdminView, setIsAdminView] = useState(false);
  const [courseId, setCourseId] = useState<string | null>(null);
  const [myCourseMemberId, setMyCourseMemberId] = useState<string | null>(null);
  const [roster, setRoster] = useState<Roster[]>([]);
  const [adminThreads, setAdminThreads] = useState<AdminThread[]>([]);
  const [generalThreadId, setGeneralThreadId] = useState<string | null>(null);
  const [dmThreadByMember, setDmThreadByMember] = useState<Record<string, string>>({});
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [activeLabel, setActiveLabel] = useState("General");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const context = await resolveCourseIdClient(supabase);
      if (!context || !user) {
        setChecking(false);
        return;
      }
      setCourseId(context.courseId);
      setIsAdminView(context.isAdminView);

      const [{ data: membership }, { data: members }] = await Promise.all([
        context.isAdminView
          ? Promise.resolve({ data: null })
          : supabase.from("course_members").select("id").eq("user_id", user.id).eq("course_id", context.courseId).single(),
        supabase.from("course_members").select("id, user_id").eq("course_id", context.courseId),
      ]);
      setMyCourseMemberId(membership?.id ?? null);

      const userIds = (members ?? []).map((m) => m.user_id);
      const { data: profiles } = userIds.length
        ? await supabase.from("profiles").select("id, email, full_name").in("id", userIds)
        : { data: [] };
      const profileByUserId = new Map((profiles ?? []).map((p) => [p.id, p]));
      const nameById = new Map(
        (members ?? []).map((m) => {
          const p = profileByUserId.get(m.user_id);
          return [m.id, p?.full_name || p?.email || "Teammate"];
        })
      );
      const rosterList: Roster[] = (members ?? [])
        .filter((m) => m.id !== membership?.id)
        .map((m) => ({ courseMemberId: m.id, name: nameById.get(m.id) ?? "Teammate" }))
        .sort((a, b) => a.name.localeCompare(b.name));
      setRoster(rosterList);

      if (context.isAdminView) {
        // Admins aren't a course_members row, so they can't get-or-create a
        // thread the way a real member does (POST /api/team-chat/threads
        // requires membership and explicitly 403s for admin view anyway) —
        // list whatever already exists instead. Read-only: RLS grants this
        // via is_platform_admin() (see supabase-schema.sql), no write policy.
        const { data: threadRows } = await supabase
          .from("chat_threads")
          .select("id, kind, participant_1_id, participant_2_id, created_at")
          .eq("course_id", context.courseId)
          .order("created_at", { ascending: true });
        const list: AdminThread[] = (threadRows ?? []).map((t) => ({
          id: t.id,
          kind: t.kind as "general" | "dm",
          label:
            t.kind === "general"
              ? "General"
              : `${nameById.get(t.participant_1_id) ?? "Teammate"} ↔ ${nameById.get(t.participant_2_id) ?? "Teammate"}`,
        }));
        setAdminThreads(list);
        if (list.length > 0) {
          setActiveThreadId(list[0].id);
          setActiveLabel(list[0].label);
        }
        setChecking(false);
        return;
      }

      const res = await fetch("/api/team-chat/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "general" }),
      });
      const data = await res.json();
      if (res.ok) {
        setGeneralThreadId(data.thread.id);
        setActiveThreadId(data.thread.id);
        setActiveLabel("General");
      }
      setChecking(false);
    }
    load();
  }, [supabase]);

  const markRead = useCallback(
    async (threadId: string) => {
      if (!myCourseMemberId) return;
      await supabase
        .from("chat_reads")
        .upsert(
          { thread_id: threadId, course_member_id: myCourseMemberId, last_read_at: new Date().toISOString() },
          { onConflict: "thread_id,course_member_id" }
        );
    },
    [supabase, myCourseMemberId]
  );

  useEffect(() => {
    if (!activeThreadId) return;
    let cancelled = false;

    async function loadMessages() {
      setLoadingThread(true);
      const { data } = await supabase
        .from("chat_messages")
        .select("id, thread_id, sender_id, body, created_at")
        .eq("thread_id", activeThreadId!)
        .order("created_at", { ascending: false })
        .limit(100);
      if (cancelled) return;
      setMessages((data ?? []).slice().reverse());
      setLoadingThread(false);
      markRead(activeThreadId!);
    }
    loadMessages();

    const channel = supabase
      .channel(`chat_messages:${activeThreadId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `thread_id=eq.${activeThreadId}` },
        (payload) => {
          const incoming = payload.new as ChatMessage;
          setMessages((prev) => (prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]));
          if (document.visibilityState === "visible") markRead(activeThreadId);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [activeThreadId, supabase, markRead]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  async function openDm(member: Roster) {
    setError(null);
    if (dmThreadByMember[member.courseMemberId]) {
      setActiveThreadId(dmThreadByMember[member.courseMemberId]);
      setActiveLabel(member.name);
      return;
    }
    const res = await fetch("/api/team-chat/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "dm", otherCourseMemberId: member.courseMemberId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Couldn't open that conversation.");
      return;
    }
    setDmThreadByMember((prev) => ({ ...prev, [member.courseMemberId]: data.thread.id }));
    setActiveThreadId(data.thread.id);
    setActiveLabel(member.name);
  }

  function openGeneral() {
    if (!generalThreadId) return;
    setActiveThreadId(generalThreadId);
    setActiveLabel("General");
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || !activeThreadId || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/team-chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: activeThreadId, body: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't send that message.");
      } else {
        setMessages((prev) => (prev.some((m) => m.id === data.message.id) ? prev : [...prev, data.message]));
        setDraft("");
      }
    } catch {
      setError("Couldn't send that message.");
    }
    setSending(false);
  }

  function nameFor(senderId: string | null) {
    if (senderId === myCourseMemberId) return "You";
    return roster.find((r) => r.courseMemberId === senderId)?.name ?? "Teammate";
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
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-green-forest mb-1">Team Chat</div>
          <div className="font-serif text-2xl text-green-dark">{activeLabel}</div>
          {isAdminView && (
            <div className="text-[11px] text-mist font-mono mt-1">👁 Admin View — read only</div>
          )}
        </div>
        {!isAdminView && <ChatNotificationsToggle />}
      </div>

      <div className="flex-1 min-h-0 flex gap-3">
        <div className="w-48 shrink-0 bg-white border-[1.5px] border-rule rounded-[10px] overflow-hidden flex flex-col">
          {isAdminView ? (
            <div className="flex-1 overflow-y-auto">
              {adminThreads.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setActiveThreadId(t.id);
                    setActiveLabel(t.label);
                  }}
                  className={`w-full text-left px-3.5 py-2 text-sm transition-colors ${
                    activeThreadId === t.id ? "bg-green-pale text-green-mid font-semibold" : "text-ink hover:bg-chalk"
                  }`}
                >
                  {t.kind === "general" ? "# General" : t.label}
                </button>
              ))}
              {adminThreads.length === 0 && (
                <div className="px-3.5 py-2 text-xs text-mist">No conversations yet on this course.</div>
              )}
            </div>
          ) : (
            <>
              <button
                onClick={openGeneral}
                className={`text-left px-3.5 py-2.5 text-sm font-semibold border-b-[1.5px] border-rule transition-colors ${
                  activeThreadId === generalThreadId ? "bg-green-pale text-green-mid" : "text-ink hover:bg-chalk"
                }`}
              >
                # General
              </button>
              <div className="px-3.5 pt-2.5 pb-1 text-[10px] font-mono uppercase tracking-widest text-mist">Direct Messages</div>
              <div className="flex-1 overflow-y-auto">
                {roster.map((m) => (
                  <button
                    key={m.courseMemberId}
                    onClick={() => openDm(m)}
                    className={`w-full text-left px-3.5 py-2 text-sm transition-colors ${
                      activeThreadId === dmThreadByMember[m.courseMemberId] ? "bg-green-pale text-green-mid font-semibold" : "text-ink hover:bg-chalk"
                    }`}
                  >
                    {m.name}
                  </button>
                ))}
                {roster.length === 0 && <div className="px-3.5 py-2 text-xs text-mist">No other teammates yet.</div>}
              </div>
            </>
          )}
        </div>

        <div className="flex-1 min-w-0 bg-white border-[1.5px] border-rule rounded-[10px] flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2.5">
            {loadingThread ? (
              <div className="text-mist text-sm">Loading...</div>
            ) : messages.length === 0 ? (
              <div className="text-mist text-sm">No messages yet — say hello.</div>
            ) : (
              messages.map((m) => (
                <div key={m.id} className="text-sm">
                  <span className="font-semibold text-ink">{nameFor(m.sender_id)}</span>{" "}
                  <span className="text-[11px] text-mist font-mono">
                    {new Date(m.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                  </span>
                  <div className="text-ink whitespace-pre-wrap break-words">{m.body}</div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
          {error && <div className="px-4 pb-1 text-xs text-red">{error}</div>}
          {isAdminView ? (
            <div className="px-4 py-3 border-t-[1.5px] border-rule text-xs text-mist">
              Log in as a real course member to send messages.
            </div>
          ) : (
            <form onSubmit={handleSend} className="flex items-end gap-2 p-3 border-t-[1.5px] border-rule">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, MAX_LEN))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend(e);
                  }
                }}
                placeholder={`Message ${activeLabel}`}
                rows={1}
                className="flex-1 px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm resize-none"
              />
              <span className="text-[10px] text-mist font-mono shrink-0">
                {draft.length}/{MAX_LEN}
              </span>
              <button
                type="submit"
                disabled={sending || !draft.trim()}
                className="px-4 py-2 bg-green-mid text-white text-sm font-semibold rounded-lg hover:bg-green-dark transition-colors disabled:opacity-50 shrink-0"
              >
                Send
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
