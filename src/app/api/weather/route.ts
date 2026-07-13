import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCourseIdServer } from "@/lib/supabase/course-context.server";
import { getWeatherForCourse } from "@/lib/weather";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const context = await resolveCourseIdServer(supabase);
  if (!context) {
    return NextResponse.json({ error: "No course found for this user." }, { status: 404 });
  }

  const { data: course } = await supabase
    .from("courses")
    .select("id, city, state, latitude, longitude")
    .eq("id", context.courseId)
    .single<{
      id: string;
      city: string | null;
      state: string | null;
      latitude: number | null;
      longitude: number | null;
    }>();

  if (!course) {
    return NextResponse.json({ error: "Course not found." }, { status: 404 });
  }

  try {
    const weather = await getWeatherForCourse(supabase, course);
    return NextResponse.json(weather);
  } catch (error) {
    console.error("Weather fetch error:", error);
    const message = error instanceof Error ? error.message : "Unable to load weather data.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
