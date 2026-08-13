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

  const context = await resolveCourseIdServer(supabase);
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
    return NextResponse.json({ error: "You can only start tasks assigned to you." }, { status: 403 });
  }

  const { data: updated, error: updateError } = await adminClient
    .from("task_assignments")
    .update({ status: "in_progress", started_at: new Date().toISOString() })
    .eq("id", assignment_id)
    .select()
    .single();
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ assignment: updated });
}
