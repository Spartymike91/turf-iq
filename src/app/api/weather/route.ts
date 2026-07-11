import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWeatherForCourse } from "@/lib/weather";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from("course_members")
    .select("course_id, courses(id, city, state, latitude, longitude)")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  const course = membership?.courses as unknown as {
    id: string;
    city: string | null;
    state: string | null;
    latitude: number | null;
    longitude: number | null;
  } | null;

  if (!course) {
    return NextResponse.json({ error: "No course found for this user." }, { status: 404 });
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
