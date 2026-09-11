import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveCourseIdServer } from "@/lib/supabase/course-context.server";

// Get-or-create a chat thread. Threads are created eagerly when either
// party *opens* a conversation, not lazily on first send — otherwise the
// other DM participant has no thread_id to subscribe Realtime to yet and
// could miss the first message live.
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

  const body = (await request.json()) as { kind?: "general" | "dm"; otherCourseMemberId?: string };
  if (body.kind !== "general" && body.kind !== "dm") {
    return NextResponse.json({ error: 'kind must be "general" or "dm".' }, { status: 400 });
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

  if (body.kind === "general") {
    const { data: inserted, error: insertError } = await adminClient
      .from("chat_threads")
      .insert({ course_id: courseId, kind: "general" })
      .select()
      .single();
    if (!insertError) return NextResponse.json({ thread: inserted });
    if (insertError.code !== "23505") {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
    const { data: existing, error: fetchError } = await adminClient
      .from("chat_threads")
      .select()
      .eq("course_id", courseId)
      .eq("kind", "general")
      .single();
    if (fetchError || !existing) {
      return NextResponse.json({ error: "Could not load the general channel." }, { status: 500 });
    }
    return NextResponse.json({ thread: existing });
  }

  // kind === "dm"
  const otherId = body.otherCourseMemberId;
  if (!otherId) {
    return NextResponse.json({ error: "otherCourseMemberId is required for a DM." }, { status: 400 });
  }
  if (otherId === membership.id) {
    return NextResponse.json({ error: "You can't DM yourself." }, { status: 400 });
  }
  const { data: otherMember } = await adminClient
    .from("course_members")
    .select("id")
    .eq("id", otherId)
    .eq("course_id", courseId)
    .maybeSingle();
  if (!otherMember) {
    return NextResponse.json({ error: "That teammate wasn't found." }, { status: 404 });
  }

  const [participant1, participant2] = [membership.id, otherId].sort();
  const { data: inserted, error: insertError } = await adminClient
    .from("chat_threads")
    .insert({ course_id: courseId, kind: "dm", participant_1_id: participant1, participant_2_id: participant2 })
    .select()
    .single();
  if (!insertError) return NextResponse.json({ thread: inserted });
  if (insertError.code !== "23505") {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }
  const { data: existing, error: fetchError } = await adminClient
    .from("chat_threads")
    .select()
    .eq("course_id", courseId)
    .eq("kind", "dm")
    .eq("participant_1_id", participant1)
    .eq("participant_2_id", participant2)
    .single();
  if (fetchError || !existing) {
    return NextResponse.json({ error: "Could not load that conversation." }, { status: 500 });
  }
  return NextResponse.json({ thread: existing });
}
