import { NextRequest, NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveCourseIdServer } from "@/lib/supabase/course-context.server";
import { notifyNewMessage } from "@/lib/push";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const context = await resolveCourseIdServer(supabase, user);
  if (!context) {
    return NextResponse.json({ error: "No course found for this user." }, { status: 404 });
  }
  if (context.isAdminView) {
    return NextResponse.json({ error: "Chat isn't available in Admin View." }, { status: 403 });
  }
  const courseId = context.courseId;

  const { threadId, body } = (await request.json()) as { threadId?: string; body?: string };
  const trimmed = (body ?? "").trim();
  if (!threadId) {
    return NextResponse.json({ error: "threadId is required." }, { status: 400 });
  }
  if (trimmed.length < 1 || trimmed.length > 2000) {
    return NextResponse.json({ error: "Message must be between 1 and 2000 characters." }, { status: 400 });
  }

  const { data: membership } = await supabase
    .from("course_members")
    .select("id")
    .eq("user_id", user.id)
    .eq("course_id", courseId)
    .single();
  if (!membership) {
    return NextResponse.json({ error: "No course found for this user." }, { status: 404 });
  }

  const adminClient = createAdminClient();

  const { data: thread } = await adminClient
    .from("chat_threads")
    .select("id, kind, participant_1_id, participant_2_id")
    .eq("id", threadId)
    .eq("course_id", courseId)
    .maybeSingle();
  if (!thread) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }
  if (thread.kind === "dm" && membership.id !== thread.participant_1_id && membership.id !== thread.participant_2_id) {
    return NextResponse.json({ error: "You're not part of this conversation." }, { status: 403 });
  }

  const { data: message, error: insertError } = await adminClient
    .from("chat_messages")
    .insert({ thread_id: threadId, course_id: courseId, sender_id: membership.id, body: trimmed })
    .select()
    .single();
  if (insertError || !message) {
    return NextResponse.json({ error: insertError?.message ?? "Could not send message." }, { status: 500 });
  }

  await adminClient.from("chat_threads").update({ last_message_at: message.created_at }).eq("id", threadId);
  await adminClient
    .from("chat_reads")
    .upsert({ thread_id: threadId, course_member_id: membership.id, last_read_at: message.created_at }, { onConflict: "thread_id,course_member_id" });

  after(async () => {
    const { data: profile } = await adminClient.from("profiles").select("full_name, email").eq("id", user.id).maybeSingle();
    const senderName = profile?.full_name || profile?.email || "Teammate";
    await notifyNewMessage(adminClient, {
      threadId,
      thread,
      courseId,
      senderId: membership.id,
      senderName,
      body: trimmed,
    });
  });

  return NextResponse.json({ message });
}
