import type { SupabaseClient, User } from "@supabase/supabase-js";

export const ADMIN_VIEW_COOKIE = "admin_view_course_id";
export const CURRENT_COURSE_COOKIE = "current_course_id";

export interface UserCourseSummary {
  courseId: string;
  courseName: string;
  role: string;
}

export interface CourseContext {
  courseId: string;
  isAdminView: boolean;
  // Every course this user belongs to — populated only on the non-admin-view
  // path (fallbackToOwnCourse already fetched it for the cookie-validation
  // check below, so this is free). Powers the course switcher in AppHeader;
  // undefined during admin view, since a platform admin has no
  // course_members rows of their own to list.
  courses?: UserCourseSummary[];
}

/**
 * Every course a user belongs to, oldest first — used both to populate the
 * switcher UI and to validate that a candidate "current course" cookie
 * value actually belongs to this user (never trust the cookie value alone).
 */
export async function getUserCourses(supabase: SupabaseClient, userId: string): Promise<UserCourseSummary[]> {
  const { data } = await supabase
    .from("course_members")
    .select("course_id, role, created_at, courses(name)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  return (data ?? []).map((row) => ({
    courseId: row.course_id as string,
    courseName: (row.courses as unknown as { name: string } | null)?.name ?? "",
    role: row.role as string,
  }));
}

/**
 * `knownUser` lets a caller that already resolved the user this request
 * (almost every route handler does, for its own auth check) skip a second
 * `auth.getUser()` round-trip here — pass it whenever you have it. Omit it
 * (or pass undefined) to have this resolve the user itself, same as before.
 *
 * `candidateCourseId` is the raw CURRENT_COURSE_COOKIE value (if any) — it's
 * validated against the user's real course_members rows rather than trusted
 * outright, and falls back to the oldest course (deterministic, not an
 * arbitrary Postgres row order) when unset or when it no longer matches a
 * real membership (e.g. the user was removed from that course).
 */
export async function fallbackToOwnCourse(
  supabase: SupabaseClient,
  knownUser?: User | null,
  candidateCourseId?: string | null
): Promise<CourseContext | null> {
  const user = knownUser !== undefined ? knownUser : (await supabase.auth.getUser()).data.user;
  if (!user) return null;

  const courses = await getUserCourses(supabase, user.id);
  if (courses.length === 0) return null;

  const match = candidateCourseId ? courses.find((c) => c.courseId === candidateCourseId) : undefined;
  return { courseId: (match ?? courses[0]).courseId, isAdminView: false, courses };
}

/**
 * Client-side course resolution. Checks the admin-view cookie first (set by
 * POST /api/admin/view-course), then the current-course cookie (set by
 * POST /api/course/switch), then falls back to the normal "which course am I
 * a member of" lookup. Both cookies are deliberately readable client-side —
 * they only ever say *which* course, never *whether* the caller is allowed
 * to touch it. RLS (and, for the switch cookie, fallbackToOwnCourse's own
 * membership validation) is the real gate: a non-admin who hand-sets either
 * cookie just gets empty results / rejected writes / silently falls back to
 * their real course.
 */
export async function resolveCourseIdClient(
  supabase: SupabaseClient,
  knownUser?: User | null
): Promise<CourseContext | null> {
  if (typeof document !== "undefined") {
    const adminMatch = document.cookie.match(new RegExp(`(?:^|; )${ADMIN_VIEW_COOKIE}=([^;]+)`));
    if (adminMatch) {
      return { courseId: decodeURIComponent(adminMatch[1]), isAdminView: true };
    }
  }
  const currentMatch =
    typeof document !== "undefined"
      ? document.cookie.match(new RegExp(`(?:^|; )${CURRENT_COURSE_COOKIE}=([^;]+)`))
      : null;
  return fallbackToOwnCourse(supabase, knownUser, currentMatch ? decodeURIComponent(currentMatch[1]) : null);
}
