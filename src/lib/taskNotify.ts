import type { SupabaseClient } from "@supabase/supabase-js";
import { sendPushToCourseMember } from "@/lib/push";
import { MOW_DIRECTIONS } from "@/lib/mowDirections";
import { CLEANUP_LAP_DIRECTIONS } from "@/lib/cleanupLapDirections";

// Courses don't store a time zone yet, and both live courses are Eastern, so
// "today" for notification timing is Eastern. When a course outside Eastern
// signs up this needs a courses.timezone column.
export const NOTIFY_TIME_ZONE = "America/New_York";

export function localToday(timeZone = NOTIFY_TIME_ZONE): string {
  return new Date().toLocaleDateString("en-CA", { timeZone });
}

export type TaskPushKind = "assigned" | "updated" | "today";

export interface TaskPushResult {
  sent: boolean;
  reason?: "not_found" | "unassigned" | "complete" | "not_today" | "no_account" | "self";
}

function describeTask(task: {
  scheduled_date: string;
  mow_direction: string | null;
  cleanup_lap_direction: string | null;
  notes: string | null;
}): string {
  const parts: string[] = [];
  const mow = MOW_DIRECTIONS.find((d) => d.value === task.mow_direction);
  if (mow) parts.push(`Mow: ${mow.label}`);
  const lap = CLEANUP_LAP_DIRECTIONS.find((d) => d.value === task.cleanup_lap_direction);
  if (lap) parts.push(`Cleanup lap: ${lap.label}`);
  if (task.notes) parts.push(task.notes);
  const text = parts.join(" · ") || "Open the app for details.";
  return text.length > 160 ? `${text.slice(0, 160)}…` : text;
}

// Pushes one task to whoever it's assigned to — only if it's scheduled for
// today (future-dated tasks wait for the morning job; past ones are stale)
// and the assignee has an account. Records the day it was announced.
// Best-effort: sendPushToCourseMember never throws.
export async function pushTaskToAssignee(
  adminClient: SupabaseClient,
  assignmentId: string,
  kind: TaskPushKind,
  options: { skipCourseMemberId?: string } = {}
): Promise<TaskPushResult> {
  const { data: task } = await adminClient
    .from("task_assignments")
    .select("id, name, assigned_to, scheduled_date, status, mow_direction, cleanup_lap_direction, notes")
    .eq("id", assignmentId)
    .maybeSingle();
  if (!task) return { sent: false, reason: "not_found" };
  if (!task.assigned_to) return { sent: false, reason: "unassigned" };
  if (task.status === "complete") return { sent: false, reason: "complete" };
  if (task.scheduled_date !== localToday()) return { sent: false, reason: "not_today" };

  const { data: employee } = await adminClient
    .from("employees")
    .select("course_member_id")
    .eq("id", task.assigned_to)
    .maybeSingle();
  const memberId = employee?.course_member_id as string | null | undefined;
  if (!memberId) return { sent: false, reason: "no_account" };
  // A manager assigning a task to themselves doesn't need a push about it.
  if (options.skipCourseMemberId && options.skipCourseMemberId === memberId) {
    return { sent: false, reason: "self" };
  }

  const title =
    kind === "updated" ? `Task updated: ${task.name}` : kind === "today" ? `Today: ${task.name}` : `New task: ${task.name}`;
  await sendPushToCourseMember(adminClient, memberId, {
    title,
    body: describeTask(task),
    url: `/tasks/status?task=${task.id}`,
    tag: `task-${task.id}`,
  });
  await adminClient.from("task_assignments").update({ notified_for_date: task.scheduled_date }).eq("id", task.id);
  return { sent: true };
}
