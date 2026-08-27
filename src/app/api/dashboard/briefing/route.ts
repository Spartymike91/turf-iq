import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCourseIdServer } from "@/lib/supabase/course-context.server";
import { fetchDashboardData } from "@/lib/dashboardBriefing";

// Fast path only — weather, today's tasks, equipment issues. No LLM call,
// so this resolves in the time of a handful of DB queries plus (usually
// cached) weather lookups, not however long Claude takes to respond. The
// AI-generated headline/focus items are fetched separately and
// asynchronously by the dashboard via /api/dashboard/headline, so the page
// can render real data immediately instead of blocking on both together.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const context = await resolveCourseIdServer(supabase, user);
  if (!context) {
    return NextResponse.json({ error: "No course found for this user." }, { status: 404 });
  }
  const courseId = context.courseId;

  const { data: course } = await supabase
    .from("courses")
    .select("name, city, state, grass_type, latitude, longitude")
    .eq("id", courseId)
    .single();

  if (!course) {
    return NextResponse.json({ error: "Course not found." }, { status: 404 });
  }

  const { weather, tasksToday, equipmentIssues } = await fetchDashboardData(supabase, courseId, course);

  return NextResponse.json({
    weather,
    tasksToday,
    equipmentIssues,
    generatedAt: new Date().toISOString(),
  });
}
