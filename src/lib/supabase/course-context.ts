import type { SupabaseClient } from "@supabase/supabase-js";

export const ADMIN_VIEW_COOKIE = "admin_view_course_id";

export interface CourseContext {
  courseId: string;
  isAdminView: boolean;
}

export async function fallbackToOwnCourse(
  supabase: SupabaseClient
): Promise<CourseContext | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
  supabase: SupabaseClient
): Promise<CourseContext | null> {
  if (typeof document !== "undefined") {
    const match = document.cookie.match(
      new RegExp(`(?:^|; )${ADMIN_VIEW_COOKIE}=([^;]+)`)
    );
    if (match) {
      return { courseId: decodeURIComponent(match[1]), isAdminView: true };
    }
  }
  return fallbackToOwnCourse(supabase);
}
