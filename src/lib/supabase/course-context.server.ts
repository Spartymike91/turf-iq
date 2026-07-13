import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { ADMIN_VIEW_COOKIE, fallbackToOwnCourse, type CourseContext } from "@/lib/supabase/course-context";

export type { CourseContext };

/**
 * Server-side equivalent of resolveCourseIdClient, for layouts and route
 * handlers — reads the cookie via next/headers instead of document.cookie.
 * Kept in its own file (rather than course-context.ts) because importing
 * next/headers anywhere in a module makes that module unsafe to bundle into
 * client components, even if the client only calls a different export from it.
 */
export async function resolveCourseIdServer(
  supabase: SupabaseClient
): Promise<CourseContext | null> {
  const cookieStore = await cookies();
  const overrideId = cookieStore.get(ADMIN_VIEW_COOKIE)?.value;
  if (overrideId) {
    return { courseId: overrideId, isAdminView: true };
  }
  return fallbackToOwnCourse(supabase);
}
