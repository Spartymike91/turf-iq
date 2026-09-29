import type { SupabaseClient } from "@supabase/supabase-js";

// Owners/superintendents can manage any task. Everyone else can only
// start/complete a task assigned to the employee record linked to their own
// login (employees.course_member_id) — set by an owner on the Labor page.
// adminClient is required because employees isn't otherwise readable by a
// crew member's own session in every case, and this check must be reliable
// regardless of the caller's own row-level access.
export async function canManageAssignment(
  supabase: SupabaseClient,
  adminClient: SupabaseClient,
  userId: string,
  courseId: string,
  isAdminView: boolean,
  assignedTo: string | null
): Promise<boolean> {
  if (isAdminView) return true;

  const { data: membership } = await supabase
    .from("course_members")
    .select("id, role")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .single();
  if (!membership) return false;
  if (membership.role === "owner" || membership.role === "superintendent") return true;

  if (!assignedTo) return false;
  const { data: employee } = await adminClient
    .from("employees")
    .select("course_member_id")
    .eq("id", assignedTo)
    .maybeSingle();
  return !!employee && employee.course_member_id === membership.id;
}

// Deliberately narrower than canManageAssignment above, and deliberately
// does NOT fall through to "the assigned employee can edit their own
// task" — the whole point is an authoritative correction by someone other
// than whoever logged the bad time in the first place. Robert asked for
// "not everyone but at least him and Nick" — Nick's actual role on his
// course is 'assistant', so this widens the usual owner/superintendent
// gate to include it, matching this app's existing precedent of extending
// owner/super-only capabilities to assistant when Robert asks for a
// specific trusted person (see Course Map pin management).
export async function canEditTaskTime(
  supabase: SupabaseClient,
  userId: string,
  courseId: string,
  isAdminView: boolean
): Promise<boolean> {
  if (isAdminView) return true;

  const { data: membership } = await supabase
    .from("course_members")
    .select("role")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .single();
  if (!membership) return false;
  return membership.role === "owner" || membership.role === "superintendent" || membership.role === "assistant";
}
