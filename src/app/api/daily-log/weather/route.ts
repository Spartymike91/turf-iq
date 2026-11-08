import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCourseIdServer } from "@/lib/supabase/course-context.server";

// WMO weather interpretation codes -> plain words (Open-Meteo's `weather_code`).
function describeCode(code: number | null, precipIn: number | null): string | null {
  if (code == null) return null;
  // The daily code reports the day's most significant weather, which can be a
  // brief shower with nothing measurable (printed "Rain" beside "0.00 in").
  const wet = (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95;
  if (wet && precipIn != null && precipIn < 0.01) return code >= 95 ? "Storms nearby, no rain measured" : "Passing showers, none measured";
  if (code === 0) return "Clear";
  if (code <= 2) return "Mostly clear";
  if (code === 3) return "Overcast";
  if (code === 45 || code === 48) return "Fog";
  if (code >= 51 && code <= 57) return "Drizzle";
  if (code >= 61 && code <= 67) return "Rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Rain showers";
  if (code === 85 || code === 86) return "Snow showers";
  if (code >= 95) return "Thunderstorms";
  return null;
}

const DAILY = "temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,weather_code";
const UNITS = "temperature_unit=fahrenheit&precipitation_unit=inch&wind_speed_unit=mph&timezone=auto";

// The app only keeps *current* weather (weather_cache is overwritten), so a
// past day's conditions are rebuilt on demand from Open-Meteo — the same
// service already used for the GDD and rainfall backfills. Its archive lags
// about 5 days, so recent days come from the forecast API's past_days instead.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const date = request.nextUrl.searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }

  const context = await resolveCourseIdServer(supabase, user);
  if (!context) return NextResponse.json({ error: "No course found." }, { status: 404 });

  const { data: course } = await supabase
    .from("courses")
    .select("latitude, longitude")
    .eq("id", context.courseId)
    .single<{ latitude: number | null; longitude: number | null }>();
  if (!course || course.latitude == null || course.longitude == null) {
    return NextResponse.json({ available: false, reason: "no_location" });
  }

  const dayMs = 86400000;
  const today = new Date().toISOString().slice(0, 10);
  const ageDays = Math.round((Date.parse(today) - Date.parse(date)) / dayMs);
  if (ageDays < 0) return NextResponse.json({ available: false, reason: "future" });

  const { latitude: lat, longitude: lon } = course;
  const url =
    ageDays > 6
      ? `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${date}&end_date=${date}&daily=${DAILY}&${UNITS}`
      : `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=${DAILY}&${UNITS}&past_days=${ageDays}&forecast_days=1`;

  try {
    const res = await fetch(url);
    if (!res.ok) return NextResponse.json({ available: false, reason: "provider_error" });
    const data = await res.json();
    const times: string[] = data?.daily?.time ?? [];
    const i = times.indexOf(date);
    if (i === -1) return NextResponse.json({ available: false, reason: "no_data" });
    const pick = (k: string): number | null => {
      const v = data.daily?.[k]?.[i];
      return typeof v === "number" ? v : null;
    };
    const high = pick("temperature_2m_max");
    if (high == null) return NextResponse.json({ available: false, reason: "no_data" });
    return NextResponse.json({
      available: true,
      highF: Math.round(high),
      lowF: pick("temperature_2m_min") != null ? Math.round(pick("temperature_2m_min") as number) : null,
      precipIn: pick("precipitation_sum"),
      windMaxMph: pick("wind_speed_10m_max") != null ? Math.round(pick("wind_speed_10m_max") as number) : null,
      conditions: describeCode(pick("weather_code"), pick("precipitation_sum")),
    });
  } catch {
    return NextResponse.json({ available: false, reason: "provider_error" });
  }
}
