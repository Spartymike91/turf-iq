import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCourseIdServer } from "@/lib/supabase/course-context.server";
import { getWeatherForCourse, type WeatherResult } from "@/lib/weather";
import { getCrabgrassStatus, getWhiteGrubStatus, getAbwStatus, isCoolSeasonGrass } from "@/lib/pestModels";
import { getDueStatus } from "@/lib/equipmentModels";

const SYSTEM_PROMPT = `You are the Turf IQ AI Agronomist, writing a short "Daily Focus" briefing for a golf course superintendent, based ONLY on the data provided below. Do not invent facts or figures. Do not recommend specific fungicide/pesticide/herbicide products or rates — defer to the superintendent's own rotation/compliance program.

Respond with ONLY a JSON object (no prose, no markdown fences) shaped exactly:
{ "headline": string, "focusItems": string[] }

"headline": one sentence (under 30 words), the single most important thing to focus on today, grounded in the data below.
"focusItems": 2-4 short bullets (under 15 words each), concrete and actionable. Where a scheduled task below is directly relevant, reference it by its actual name rather than inventing a new one. A task already marked "complete" is done — never instruct the user to complete, do, or start it; if worth mentioning at all, only note it in passing (e.g. as context already handled), and prefer bullets about what's still open.`;

interface TaskToday {
  id: string;
  name: string;
  priority: "low" | "normal" | "high";
  status: "not_started" | "in_progress" | "complete";
  assigned_to: string | null;
  estimated_minutes: number | null;
}

interface EquipmentIssue {
  equipmentName: string;
  task: string;
  status: "OVERDUE" | "DUE SOON";
  hoursRemaining: number | null;
  daysRemaining: number | null;
}

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
  const courseId = context.courseId;

  const { data: course } = await supabase
    .from("courses")
    .select("name, city, state, grass_type, latitude, longitude")
    .eq("id", courseId)
    .single();

  if (!course) {
    return NextResponse.json({ error: "Course not found." }, { status: 404 });
  }

  const promptSections: string[] = [
    `COURSE: ${course.name}, ${course.city ?? "—"}, ${course.state ?? "—"} · ${course.grass_type ?? "grass type not set"}`,
  ];

  let weather: WeatherResult | null = null;
  try {
    weather = await getWeatherForCourse(supabase, {
      id: courseId,
      city: course.city,
      state: course.state,
      latitude: course.latitude,
      longitude: course.longitude,
    });

    const { dollarSpot, pythium, brownPatch } = weather.diseaseRisk;
    promptSections.push(
      `WEATHER: ${weather.current.tempF}°F (${weather.current.description}), high ${weather.current.highF}°F / low ${weather.current.lowF}°F, humidity ${weather.current.humidity ?? "—"}%
DISEASE RISK: Dollar Spot ${dollarSpot.probabilityPct.toFixed(1)}% (action threshold ${dollarSpot.actionThresholdPct}%, currently ${dollarSpot.probabilityPct >= dollarSpot.actionThresholdPct ? "ABOVE" : "below"} it) · Pythium Blight ${pythium.elevated ? "conditions MET" : "not elevated"} · Brown Patch ${brownPatch.elevated ? "conditions MET" : "not elevated"}`
    );

    const gdd = weather.agronomics.gddSeasonToDate;
    const crabgrass = getCrabgrassStatus(gdd);
    const whiteGrub = getWhiteGrubStatus(gdd);
    const pestLines = [`PEST/WEED (GDD ${gdd.toFixed(1)}): Crabgrass — ${crabgrass.stage}. White Grub — ${whiteGrub.stage}.`];
    if (isCoolSeasonGrass(course.grass_type)) {
      const abw = getAbwStatus(gdd);
      pestLines.push(`Annual Bluegrass Weevil — ${abw.stage}.`);
    }
    promptSections.push(pestLines.join(" "));
  } catch (error) {
    console.error("Briefing weather error:", error);
    promptSections.push("WEATHER: unavailable right now.");
  }

  const { data: pestApps } = await supabase
    .from("pest_applications")
    .select("applied_at, target, product")
    .eq("course_id", courseId)
    .order("applied_at", { ascending: false })
    .limit(3);

  if (pestApps && pestApps.length > 0) {
    promptSections.push(
      `RECENT APPLICATIONS: ${pestApps.map((a) => `${a.target} (${a.product}) on ${new Date(a.applied_at).toLocaleDateString()}`).join("; ")}`
    );
  } else {
    promptSections.push("RECENT APPLICATIONS: none logged.");
  }

  const today = new Date().toISOString().slice(0, 10);
  const { data: tasksTodayRaw } = await supabase
    .from("task_assignments")
    .select("id, name, priority, status, assigned_to, estimated_minutes")
    .eq("course_id", courseId)
    .eq("scheduled_date", today);

  const tasksToday: TaskToday[] = tasksTodayRaw ?? [];

  if (tasksToday.length > 0) {
    promptSections.push(
      `TODAY'S TASKS: ${tasksToday.map((t) => `"${t.name}" (${t.priority}, ${t.status})`).join("; ")}`
    );
  } else {
    promptSections.push("TODAY'S TASKS: none scheduled.");
  }

  const { data: equipmentList } = await supabase
    .from("equipment")
    .select("id, name, current_hours")
    .eq("course_id", courseId)
    .eq("is_active", true);

  const equipmentIssues: EquipmentIssue[] = [];
  if (equipmentList && equipmentList.length > 0) {
    const equipmentIds = equipmentList.map((e) => e.id);
    const [{ data: scheduleItems }, { data: maintenanceLogs }] = await Promise.all([
      supabase.from("maintenance_schedule_items").select("*").in("equipment_id", equipmentIds),
      supabase.from("maintenance_log").select("*").in("equipment_id", equipmentIds),
    ]);

    for (const item of scheduleItems ?? []) {
      const eq = equipmentList.find((e) => e.id === item.equipment_id);
      if (!eq) continue;
      const due = getDueStatus(item, eq, maintenanceLogs ?? []);
      if (due.status !== "OK") {
        equipmentIssues.push({
          equipmentName: eq.name,
          task: item.task,
          status: due.status,
          hoursRemaining: due.hoursRemaining,
          daysRemaining: due.daysRemaining,
        });
      }
    }
  }

  promptSections.push(
    equipmentIssues.length > 0
      ? `EQUIPMENT ISSUES: ${equipmentIssues.map((i) => `${i.equipmentName} — ${i.task} (${i.status})`).join("; ")}`
      : "EQUIPMENT ISSUES: none."
  );

  let headline: string | null = null;
  let focusItems: string[] = [];

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 400,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: promptSections.join("\n") }],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const text = data.content[0].text.trim();
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch {
          const match = text.match(/\{[\s\S]*\}/);
          parsed = match ? JSON.parse(match[0]) : null;
        }
        if (parsed && typeof parsed.headline === "string" && Array.isArray(parsed.focusItems)) {
          headline = parsed.headline;
          focusItems = parsed.focusItems.filter((f: unknown) => typeof f === "string");
        }
      } else {
        console.error("Briefing Anthropic API error:", await res.text());
      }
    } catch (error) {
      console.error("Briefing generation error:", error);
    }
  }

  return NextResponse.json({
    headline,
    focusItems,
    weather,
    tasksToday,
    equipmentIssues,
    generatedAt: new Date().toISOString(),
  });
}
