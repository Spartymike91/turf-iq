import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { localToday, pushTaskToAssignee } from "@/lib/taskNotify";

// Called by the Scheduler right after a task is created or edited. Tells the
// assigned employee on their phone — immediately when the task is for today,
// otherwise not at all here: a future-dated task is announced by the morning
// job (/api/cron/task-morning-push) on its day, and an edit that lands on a
// future date clears the "already announced" mark so that job re-sends the
// latest version of the instructions.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { assignment_id, kind } = (await request.json()) as { assignment_id?: string; kind?: "assigned" | "updated" };
  if (!assignment_id || (kind !== "assigned" && kind !== "updated")) {
    return NextResponse.json({ error: "assignment_id and kind (assigned|updated) are required." }, { status: 400 });
  }

  const adminClient = createAdminClient();
  const { data: task } = await adminClient
    .from("task_assignments")
    .select("id, course_id, scheduled_date")
    .eq("id", assignment_id)
    .maybeSingle();
  if (!task) return NextResponse.json({ error: "Task not found." }, { status: 404 });

  // Same people the Scheduler's own write policy lets schedule tasks.
  const { data: membership } = await adminClient
    .from("course_members")
    .select("id, role")
    .eq("user_id", user.id)
    .eq("course_id", task.course_id)
    .maybeSingle();
  if (!membership || !["owner", "superintendent", "assistant"].includes(membership.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (task.scheduled_date !== localToday()) {
    if (kind === "updated") {
      await adminClient.from("task_assignments").update({ notified_for_date: null }).eq("id", task.id);
    }
    return NextResponse.json({ sent: false, reason: "scheduled_later" });
  }

  const result = await pushTaskToAssignee(adminClient, task.id, kind, { skipCourseMemberId: membership.id });
  return NextResponse.json(result);
}
