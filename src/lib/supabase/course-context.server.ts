import type { SupabaseClient, User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { ADMIN_VIEW_COOKIE, fallbackToOwnCourse, type CourseContext } from "@/lib/supabase/course-context";

export type { CourseContext };

/**
 * Server-side equivalent of resolveCourseIdClient, for layouts and route
 * handlers — reads the cookie via next/headers instead of document.cookie.
 * Kept in its own file (rather than course-context.ts) because importing
 * next/headers anywhere in a module makes that module unsafe to bundle into
 * client components, even if the client only calls a different export from it.
 *
 * Pass `knownUser` when the caller already resolved the user for its own
 * auth check, to avoid a second `auth.getUser()` round-trip in
 * fallbackToOwnCourse — see its docstring.
 */
export async function resolveCourseIdServer(
  supabase: SupabaseClient,
  knownUser?: User | null
): Promise<CourseContext | null> {
  const cookieStore = await cookies();
  const overrideId = cookieStore.get(ADMIN_VIEW_COOKIE)?.value;
  if (overrideId) {
    return { courseId: overrideId, isAdminView: true };
  }
  return fallbackToOwnCourse(supabase, knownUser);
}
