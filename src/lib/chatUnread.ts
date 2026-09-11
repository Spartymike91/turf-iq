import type { SupabaseClient } from "@supabase/supabase-js";

// Shared by the Chat page and AppHeader's nav dot — "unread" means at least
// one thread the caller can see (general channel + their own DMs, already
// enforced by chat_threads' RLS) has a message newer than their own
// chat_reads row for it, or has never been opened at all.
export async function checkHasUnreadChat(
  supabase: SupabaseClient,
  courseId: string,
  courseMemberId: string
): Promise<boolean> {
  const [{ data: threads }, { data: reads }] = await Promise.all([
    supabase.from("chat_threads").select("id, last_message_at").eq("course_id", courseId).not("last_message_at", "is", null),
    supabase.from("chat_reads").select("thread_id, last_read_at").eq("course_member_id", courseMemberId),
  ]);
  if (!threads || threads.length === 0) return false;
  const readAtByThread = new Map((reads ?? []).map((r) => [r.thread_id, r.last_read_at]));
  return threads.some((t) => {
    const readAt = readAtByThread.get(t.id);
    return !readAt || new Date(t.last_message_at as string) > new Date(readAt);
  });
}
