import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveCourseIdServer } from "@/lib/supabase/course-context.server";
import { canManageAssignment } from "@/lib/taskPermissions";

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
  const courseId = context.courseId;

  const { assignment_id } = (await request.json()) as { assignment_id?: string };
  if (!assignment_id) {
    return NextResponse.json({ error: "assignment_id is required." }, { status: 400 });
  }

  const adminClient = createAdminClient();

  const { data: assignment, error: fetchError } = await adminClient
    .from("task_assignments")
    .select("*")
    .eq("id", assignment_id)
    .eq("course_id", courseId)
    .single();
  if (fetchError || !assignment) {
    return NextResponse.json({ error: "Task assignment not found." }, { status: 404 });
  }

  const allowed = await canManageAssignment(
    supabase,
    adminClient,
    user.id,
    courseId,
    context.isAdminView,
    assignment.assigned_to
  );
  if (!allowed) {
    return NextResponse.json({ error: "You can only resume tasks assigned to you." }, { status: 403 });
  }

  if (assignment.status !== "paused" || !assignment.paused_at) {
    return NextResponse.json({ error: "Only a paused task can be resumed." }, { status: 400 });
  }

  const elapsedMinutes = Math.max(0, (Date.now() - new Date(assignment.paused_at).getTime()) / 60000);

  const { data: updated, error: updateError } = await adminClient
    .from("task_assignments")
    .update({
      status: "in_progress",
      paused_at: null,
      paused_minutes: Number(assignment.paused_minutes ?? 0) + elapsedMinutes,
    })
    .eq("id", assignment_id)
    .select()
    .single();
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ assignment: updated });
}
