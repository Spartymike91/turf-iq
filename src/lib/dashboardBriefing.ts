import type { SupabaseClient } from "@supabase/supabase-js";
import { getWeatherForCourse, type WeatherResult } from "@/lib/weather";
import { getCrabgrassStatus, getWhiteGrubStatus, getAbwStatus, isCoolSeasonGrass } from "@/lib/pestModels";
import { getDueStatus } from "@/lib/equipmentModels";

export interface TaskToday {
  id: string;
  name: string;
  priority: number;
  status: "not_started" | "in_progress" | "complete";
  assigned_to: string | null;
  estimated_minutes: number | null;
}

export interface EquipmentIssue {
  equipmentName: string;
  task: string;
  status: "OVERDUE" | "DUE SOON";
  hoursRemaining: number | null;
  daysRemaining: number | null;
}

interface CourseRow {
  name: string;
  city: string | null;
  state: string | null;
  grass_type: string | null;
  latitude: number | null;
  longitude: number | null;
}

interface DashboardData {
  weather: WeatherResult | null;
  pestApps: { applied_at: string; target: string | null; product: string }[];
  tasksToday: TaskToday[];
  equipmentIssues: EquipmentIssue[];
}

/**
 * The data both /api/dashboard/briefing (fast, no LLM) and
 * /api/dashboard/headline (slow, calls Anthropic) need. Shared here so the
 * headline route doesn't have to trust client-submitted data to build its
 * prompt — it re-resolves this itself. The four queries are independent of
 * each other, so they run concurrently; weather.ts's own 15-minute cache
 * means calling this twice in quick succession (once from each route) won't
 * usually re-hit external weather APIs.
 */
export async function fetchDashboardData(
  supabase: SupabaseClient,
  courseId: string,
  course: CourseRow
): Promise<DashboardData> {
  const today = new Date().toISOString().slice(0, 10);

  const [weather, { data: pestApps }, { data: tasksTodayRaw }, { data: equipmentList }] = await Promise.all([
    getWeatherForCourse(supabase, {
      id: courseId,
      city: course.city,
      state: course.state,
      latitude: course.latitude,
      longitude: course.longitude,
    }).catch((error) => {
      console.error("Dashboard weather error:", error);
      return null;
    }),
    supabase
      .from("pest_applications")
      .select("applied_at, target, product")
      .eq("course_id", courseId)
      .order("applied_at", { ascending: false })
      .limit(3),
    supabase
      .from("task_assignments")
      .select("id, name, priority, status, assigned_to, estimated_minutes")
      .eq("course_id", courseId)
      .eq("scheduled_date", today),
    supabase.from("equipment").select("id, name, current_hours").eq("course_id", courseId).eq("is_active", true),
  ]);

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

  return {
    weather,
    pestApps: pestApps ?? [],
    tasksToday: tasksTodayRaw ?? [],
    equipmentIssues,
  };
}

/** Builds the same prompt text the old combined route sent to Claude. */
export function buildPromptSections(course: CourseRow, data: DashboardData): string[] {
  const { weather, pestApps, tasksToday, equipmentIssues } = data;
  const promptSections: string[] = [
    `COURSE: ${course.name}, ${course.city ?? "—"}, ${course.state ?? "—"} · ${course.grass_type ?? "grass type not set"}`,
  ];

  if (weather) {
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
  } else {
    promptSections.push("WEATHER: unavailable right now.");
  }

  if (pestApps.length > 0) {
    promptSections.push(
      `RECENT APPLICATIONS: ${pestApps.map((a) => `${a.target ? `${a.target} (${a.product})` : a.product} on ${new Date(a.applied_at).toLocaleDateString()}`).join("; ")}`
    );
  } else {
    promptSections.push("RECENT APPLICATIONS: none logged.");
  }

  if (tasksToday.length > 0) {
    promptSections.push(
      `TODAY'S TASKS: ${tasksToday.map((t) => `"${t.name}" (task ${t.priority}, ${t.status})`).join("; ")}`
    );
  } else {
    promptSections.push("TODAY'S TASKS: none scheduled.");
  }

  promptSections.push(
    equipmentIssues.length > 0
      ? `EQUIPMENT ISSUES: ${equipmentIssues.map((i) => `${i.equipmentName} — ${i.task} (${i.status})`).join("; ")}`
      : "EQUIPMENT ISSUES: none."
  );

  return promptSections;
}
