import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { CURRENT_COURSE_COOKIE, getUserCourses } from "@/lib/supabase/course-context";

// Sets which of a user's courses is "current" for this browser — the course
// switcher in AppHeader, and the create-a-course flow (see CourseForm),
// both call this. Validated against real course_members rows rather than
// trusting the request body, since this cookie drives real access downstream
// (unlike ADMIN_VIEW_COOKIE, whose real gate is is_platform_admin() in RLS).
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { course_id } = (await request.json()) as { course_id?: string };
  if (!course_id) {
    return NextResponse.json({ error: "course_id is required." }, { status: 400 });
  }

  const courses = await getUserCourses(supabase, user.id);
  if (!courses.some((c) => c.courseId === course_id)) {
    return NextResponse.json({ error: "You're not a member of that course." }, { status: 403 });
  }

  const cookieStore = await cookies();
  cookieStore.set(CURRENT_COURSE_COOKIE, course_id, {
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  });

  return NextResponse.json({ ok: true });
}
