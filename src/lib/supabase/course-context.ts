import type { SupabaseClient, User } from "@supabase/supabase-js";

export const ADMIN_VIEW_COOKIE = "admin_view_course_id";

export interface CourseContext {
  courseId: string;
  isAdminView: boolean;
}

/**
 * `knownUser` lets a caller that already resolved the user this request
 * (almost every route handler does, for its own auth check) skip a second
 * `auth.getUser()` round-trip here — pass it whenever you have it. Omit it
 * (or pass undefined) to have this resolve the user itself, same as before.
 */
export async function fallbackToOwnCourse(
  supabase: SupabaseClient,
  knownUser?: User | null
): Promise<CourseContext | null> {
  const user = knownUser !== undefined ? knownUser : (await supabase.auth.getUser()).data.user;
  if (!user) return null;

  const { data: membership } = await supabase
    .from("course_members")
    .select("course_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership?.course_id) return null;
  return { courseId: membership.course_id, isAdminView: false };
}

/**
 * Client-side course resolution. Checks the admin-view cookie first (set by
 * POST /api/admin/view-course), then falls back to the normal "which course
 * am I a member of" lookup. The cookie is deliberately readable client-side —
 * it only ever says *which* course, never *whether* the caller is allowed to
 * touch it. is_platform_admin() in RLS is the only real gate: a non-admin who
 * hand-sets this cookie just gets empty results / rejected writes.
 */
export async function resolveCourseIdClient(
  supabase: SupabaseClient,
  knownUser?: User | null
): Promise<CourseContext | null> {
  if (typeof document !== "undefined") {
    const match = document.cookie.match(
      new RegExp(`(?:^|; )${ADMIN_VIEW_COOKIE}=([^;]+)`)
    );
    if (match) {
      return { courseId: decodeURIComponent(match[1]), isAdminView: true };
    }
  }
  return fallbackToOwnCourse(supabase, knownUser);
}
