import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveCourseIdServer } from "@/lib/supabase/course-context.server";
import { canEditTaskTime } from "@/lib/taskPermissions";
import { upsertTaskLaborExpense } from "@/lib/taskLabor";

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

  const allowed = await canEditTaskTime(supabase, user.id, courseId, context.isAdminView);
  if (!allowed) {
    return NextResponse.json({ error: "Only owners, superintendents, or assistants can edit task time." }, { status: 403 });
  }

  const { assignment_id, actual_minutes } = (await request.json()) as {
    assignment_id?: string;
    actual_minutes?: number | null;
  };
  if (!assignment_id) {
    return NextResponse.json({ error: "assignment_id is required." }, { status: 400 });
  }
  if (actual_minutes != null && (typeof actual_minutes !== "number" || !Number.isFinite(actual_minutes) || actual_minutes < 0)) {
    return NextResponse.json({ error: "actual_minutes must be a non-negative number, or null to clear." }, { status: 400 });
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

  const { data: updated, error: updateError } = await adminClient
    .from("task_assignments")
    .update({ actual_minutes_override: actual_minutes ?? null })
    .eq("id", assignment_id)
    .select()
    .single();
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // If this task already completed, its labor expense was computed from
  // whatever time was on file at that moment — recompute it now so a
  // correction here actually fixes the number that already landed in
  // Budget, not just what the task card shows. Clearing the override
  // (actual_minutes: null) falls back to the raw timestamp math, same as
  // taskDuration.ts's actualMinutesFor.
  let laborExpense = null;
  if (updated.status === "complete") {
    const minutes =
      actual_minutes != null
        ? actual_minutes
        : updated.started_at && updated.completed_at
          ? Math.max(
              0,
              (new Date(updated.completed_at).getTime() - new Date(updated.started_at).getTime()) / 60000 -
                Number(updated.paused_minutes ?? 0)
            )
          : 0;
    laborExpense = await upsertTaskLaborExpense(
      adminClient,
      courseId,
      updated,
      minutes,
      (updated.completed_at ?? new Date().toISOString()).slice(0, 10)
    );
  }

  return NextResponse.json({ assignment: updated, laborExpense });
}
