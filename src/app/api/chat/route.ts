import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCourseIdServer } from "@/lib/supabase/course-context.server";
import { getWeatherForCourse } from "@/lib/weather";
import { getCrabgrassStatus, getWhiteGrubStatus, getAbwStatus, isCoolSeasonGrass } from "@/lib/pestModels";
import { getDueStatus } from "@/lib/equipmentModels";
import { computeWeeklyPayroll, getWeekStart } from "@/lib/payroll";

async function buildSystemPrompt(
  supabase: Awaited<ReturnType<typeof createClient>>,
  courseId: string
) {
  const fiscalYear = new Date().getFullYear();

  const { data: course } = await supabase
    .from("courses")
    .select("name, city, state, grass_type, climate_zone, num_holes, maintained_acres, latitude, longitude")
    .eq("id", courseId)
    .single();

  const sections: string[] = [];

  if (course) {
    sections.push(
      `COURSE PROFILE:
- ${course.name}, ${course.city ?? "—"}, ${course.state ?? "—"}
- ${course.num_holes ?? "—"} holes · ${course.maintained_acres ?? "—"} maintained acres · ${course.grass_type ?? "not set"}
- Climate zone: ${course.climate_zone ?? "not set"}
- Today: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`
    );
  }

  if (course) {
    try {
      const weather = await getWeatherForCourse(supabase, {
        id: courseId,
        city: course.city,
        state: course.state,
        latitude: course.latitude,
        longitude: course.longitude,
      });
      sections.push(
        `CURRENT WEATHER (live, National Weather Service):
- Temperature: ${weather.current.tempF}°F (${weather.current.description}), High ${weather.current.highF}°F / Low ${weather.current.lowF}°F
- Humidity: ${weather.current.humidity ?? "—"}% · Wind: ${weather.current.windSpeed ?? "—"} mph ${weather.current.windDirection ?? ""}
- Today's ET (estimated): ${weather.agronomics.et0In.toFixed(2)}"
- GDD season to date: ${weather.agronomics.gddSeasonToDate.toFixed(1)} (base 50°F, tracked since app setup)
- Estimated leaf wetness: ${weather.agronomics.leafWetnessHours} hrs
- 7-day rainfall forecast: ${weather.agronomics.weekRainfallIn.toFixed(2)}"`
      );

      const { dollarSpot, pythium, brownPatch } = weather.diseaseRisk;
      sections.push(
        `DISEASE RISK:
- Dollar Spot (Smith-Kerns statistical model, validated): ${dollarSpot.probabilityPct.toFixed(1)}% probability${dollarSpot.inValidRange ? "" : " (outside the model's validated temp range — treat cautiously)"} — action threshold is 20%, currently ${dollarSpot.probabilityPct >= dollarSpot.actionThresholdPct ? "ABOVE" : "below"} it
- Pythium Blight (Nutter-Shane rule-based heuristic, not a statistical model): ${pythium.elevated ? "conditions MET" : "conditions not elevated"} (max ${pythium.maxTempF}°F, min ${pythium.minTempF}°F, ${pythium.hoursRhAbove90}h with RH≥90%)
- Brown Patch (qualitative heuristic, no validated model exists): ${brownPatch.elevated ? "conditions MET" : "conditions not elevated"} (overnight low ${brownPatch.overnightLowF}°F, ${brownPatch.hoursRhAbove95}h with RH≥95%)
- No model exists for Anthracnose or Take-All Patch in this system — don't state figures for those.`
      );

      const gdd = weather.agronomics.gddSeasonToDate;
      const crabgrass = getCrabgrassStatus(gdd);
      const whiteGrub = getWhiteGrubStatus(gdd);
      const pestLines = [
        `PEST & WEED (GDD50-based timing, base 50°F, ${gdd.toFixed(1)} GDD season to date):`,
        `- Crabgrass (Purdue/Michigan State/UW-Madison validated 200 GDD50 threshold): ${crabgrass.stage} — ${crabgrass.detail}`,
        `- White Grub (industry guidance range, not primary-extension-sourced): ${whiteGrub.stage} — ${whiteGrub.detail}`,
      ];
      if (isCoolSeasonGrass(course.grass_type)) {
        const abw = getAbwStatus(gdd);
        pestLines.push(`- Annual Bluegrass Weevil: ${abw.stage} — ${abw.detail}`);
      }

      const { data: pestApps } = await supabase
        .from("pest_applications")
        .select("applied_at, target, product, rei_hours")
        .eq("course_id", courseId)
        .order("applied_at", { ascending: false })
        .limit(5);

      if (pestApps && pestApps.length > 0) {
        const nowMs = Date.now();
        pestLines.push(
          `- Recent applications: ${pestApps
            .map((a) => {
              const clearAt = new Date(a.applied_at).getTime() + a.rei_hours * 60 * 60 * 1000;
              const status = nowMs < clearAt ? "RESTRICTED (REI active)" : "clear";
              return `${a.target} (${a.product}) on ${new Date(a.applied_at).toLocaleDateString()} — ${status}`;
            })
            .join("; ")}`
        );
      } else {
        pestLines.push("- No applications logged yet.");
      }
      sections.push(pestLines.join("\n"));
    } catch {
      sections.push("CURRENT WEATHER, DISEASE RISK, AND PEST/WEED TIMING: unavailable right now.");
    }
  }

  const { data: fertilityProgram } = await supabase
    .from("fertility_programs")
    .select("annual_n_target")
    .eq("course_id", courseId)
    .eq("fiscal_year", fiscalYear)
    .maybeSingle();

  const { data: fertilizerApps } = await supabase
    .from("fertilizer_applications")
    .select("n_lbs_per_1000")
    .eq("course_id", courseId)
    .gte("application_date", `${fiscalYear}-01-01`);

  const { data: latestSoilTest } = await supabase
    .from("soil_tests")
    .select("zone, test_date, ph, phosphorus_ppm, potassium_ppm, iron_ppm")
    .eq("course_id", courseId)
    .order("test_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fertilityProgram || (fertilizerApps && fertilizerApps.length > 0) || latestSoilTest) {
    const nApplied = (fertilizerApps ?? []).reduce((sum, a) => sum + Number(a.n_lbs_per_1000), 0);
    const lines = [`FERTILITY PROGRAM (${fiscalYear}):`];
    lines.push(
      `- N applied YTD: ${nApplied.toFixed(1)} lbs/M${
        fertilityProgram ? ` (target ${Number(fertilityProgram.annual_n_target).toFixed(1)} lbs/M season)` : " (no target set)"
      }`
    );
    if (latestSoilTest) {
      lines.push(
        `- Latest soil test (${latestSoilTest.zone}, ${latestSoilTest.test_date}): pH ${latestSoilTest.ph ?? "—"}, P ${latestSoilTest.phosphorus_ppm ?? "—"} ppm, K ${latestSoilTest.potassium_ppm ?? "—"} ppm, Fe ${latestSoilTest.iron_ppm ?? "—"} ppm`
      );
    }
    sections.push(lines.join("\n"));
  }

  const { data: budgetCategories } = await supabase
    .from("budget_categories")
    .select("id, name, annual_budget")
    .eq("course_id", courseId)
    .eq("fiscal_year", fiscalYear);

  if (budgetCategories && budgetCategories.length > 0) {
    const { data: expenses } = await supabase
      .from("expenses")
      .select("amount")
      .eq("course_id", courseId)
      .gte("expense_date", `${fiscalYear}-01-01`)
      .lte("expense_date", `${fiscalYear}-12-31`);

    const annualBudget = budgetCategories.reduce((sum, c) => sum + Number(c.annual_budget), 0);
    const ytdSpent = (expenses ?? []).reduce((sum, e) => sum + Number(e.amount), 0);
    sections.push(
      `BUDGET (FY ${fiscalYear}):
- Annual budget: $${annualBudget.toLocaleString()} · YTD spent: $${ytdSpent.toLocaleString()} (${annualBudget > 0 ? ((ytdSpent / annualBudget) * 100).toFixed(0) : 0}%)`
    );
  }

  const { data: employees } = await supabase
    .from("employees")
    .select("id")
    .eq("course_id", courseId)
    .eq("is_active", true);

  if (employees && employees.length > 0) {
    sections.push(`LABOR:\n- ${employees.length} active staff on the roster`);
  }

  const { data: irrigationProgram } = await supabase
    .from("irrigation_programs")
    .select("annual_water_budget_gal")
    .eq("course_id", courseId)
    .eq("fiscal_year", fiscalYear)
    .maybeSingle();

  const monthStart = `${fiscalYear}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`;
  const { data: irrigationLogs } = await supabase
    .from("irrigation_logs")
    .select("gallons")
    .eq("course_id", courseId)
    .gte("cycle_date", monthStart);

  const { data: latestMoisture } = await supabase
    .from("soil_moisture_readings")
    .select("zone, reading_date, vwc_pct")
    .eq("course_id", courseId)
    .order("reading_date", { ascending: false })
    .limit(5);

  if (irrigationProgram || (irrigationLogs && irrigationLogs.length > 0) || (latestMoisture && latestMoisture.length > 0)) {
    const gallonsMtd = (irrigationLogs ?? []).reduce((sum, l) => sum + Number(l.gallons), 0);
    const lines = ["IRRIGATION:"];
    lines.push(
      `- Water used MTD: ${Math.round(gallonsMtd).toLocaleString()} gal${
        irrigationProgram ? ` (annual budget ${Number(irrigationProgram.annual_water_budget_gal).toLocaleString()} gal/year)` : " (no annual budget set)"
      }`
    );
    if (latestMoisture && latestMoisture.length > 0) {
      lines.push(
        `- Latest soil moisture readings: ${latestMoisture
          .map((r) => `${r.zone} ${Number(r.vwc_pct).toFixed(1)}% (${r.reading_date})`)
          .join(", ")} (target 22–28% VWC)`
      );
    } else {
      lines.push("- No soil moisture readings logged (manual entry only, no sensor integration).");
    }
    sections.push(lines.join("\n"));
  }

  const { data: equipmentList } = await supabase
    .from("equipment")
    .select("id, name, make, model, current_hours, is_active")
    .eq("course_id", courseId)
    .eq("is_active", true);

  if (equipmentList && equipmentList.length > 0) {
    const equipmentIds = equipmentList.map((e) => e.id);
    const [{ data: scheduleItems }, { data: maintenanceLogs }] = await Promise.all([
      supabase.from("maintenance_schedule_items").select("*").in("equipment_id", equipmentIds),
      supabase.from("maintenance_log").select("*").in("equipment_id", equipmentIds),
    ]);

    const issues: string[] = [];
    for (const item of scheduleItems ?? []) {
      const eq = equipmentList.find((e) => e.id === item.equipment_id);
      if (!eq) continue;
      const due = getDueStatus(item, eq, maintenanceLogs ?? []);
      if (due.status !== "OK") {
        const remaining =
          due.hoursRemaining != null
            ? `${Math.abs(due.hoursRemaining).toFixed(0)}h ${due.hoursRemaining < 0 ? "overdue" : "remaining"}`
            : due.daysRemaining != null
            ? `${Math.abs(due.daysRemaining)}d ${due.daysRemaining < 0 ? "overdue" : "remaining"}`
            : "";
        issues.push(`${eq.name} — ${item.task}: ${due.status} (${remaining})`);
      }
    }

    sections.push(
      `EQUIPMENT (${equipmentList.length} active units):
${issues.length > 0 ? issues.map((i) => `- ${i}`).join("\n") : "- No overdue or due-soon maintenance items."}`
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const [{ data: tasksToday }, { data: allEmployees }] = await Promise.all([
    supabase.from("task_assignments").select("id, name, priority, status").eq("course_id", courseId).eq("scheduled_date", today),
    supabase.from("employees").select("id, name, hourly_rate, is_active").eq("course_id", courseId),
  ]);

  if ((tasksToday && tasksToday.length > 0) || (allEmployees && allEmployees.length > 0)) {
    const weekStart = getWeekStart(new Date());
    const { data: weekEntries } = await supabase
      .from("time_entries")
      .select("employee_id, clock_in, clock_out")
      .eq("course_id", courseId)
      .gte("clock_in", weekStart.toISOString());

    const clockedInNow = (weekEntries ?? []).filter((e) => e.clock_out === null).length;
    const payroll = computeWeeklyPayroll(allEmployees ?? [], weekEntries ?? [], weekStart);
    const otRisk = payroll.filter((p) => p.regularHours + p.otHours >= 35);
    const complete = (tasksToday ?? []).filter((t) => t.status === "complete").length;
    const highPriorityOpen = (tasksToday ?? []).filter((t) => t.priority === "high" && t.status !== "complete");

    const lines = [
      `TASKS & LABOR OPS (today, ${today}):`,
      `- Tasks: ${complete} of ${(tasksToday ?? []).length} complete today`,
      `- Clocked in right now: ${clockedInNow} of ${(allEmployees ?? []).filter((e) => e.is_active).length} active staff`,
    ];
    if (highPriorityOpen.length > 0) {
      lines.push(`- High priority open tasks: ${highPriorityOpen.map((t) => t.name).join(", ")}`);
    }
    if (otRisk.length > 0) {
      lines.push(`- OT risk this week (≥35h): ${otRisk.map((p) => `${p.name} (${(p.regularHours + p.otHours).toFixed(1)}h)`).join(", ")}`);
    }
    sections.push(lines.join("\n"));
  }

  const { data: teamMembers } = await supabase
    .from("course_members")
    .select("role")
    .eq("course_id", courseId);

  if (teamMembers && teamMembers.length > 0) {
    const roleLabel: Record<string, string> = {
      owner: "owner",
      superintendent: "superintendent",
      assistant: "assistant",
      crew_lead: "crew lead",
      crew: "crew",
    };
    const counts: Record<string, number> = {};
    for (const m of teamMembers) counts[m.role] = (counts[m.role] ?? 0) + 1;
    const breakdown = Object.entries(counts)
      .map(([role, n]) => `${n} ${roleLabel[role] ?? role}${n === 1 ? "" : "s"}`)
      .join(", ");
    sections.push(`TEAM:\n- ${teamMembers.length} active members: ${breakdown}`);
  }

  sections.push(
    "NOTE: Disease risk, pest/weed GDD timing, irrigation/soil-moisture, equipment maintenance, and tasks/labor ops are all live (see above), but do not recommend specific fungicide/pesticide/herbicide products or rates beyond what's already logged — always defer to the superintendent's own rotation/compliance program for product choice. Maintenance schedule items may be AI-suggested (not manufacturer-verified) — note that provenance when relevant rather than treating them as authoritative. Note the different confidence levels stated above (validated model vs. guidance range vs. heuristic) rather than treating all figures as equally certain."
  );

  return `You are the Turf IQ AI Agronomist — a virtual agronomic advisor for golf course superintendents.

${sections.join("\n\n")}

GUIDELINES:
- Give specific, actionable recommendations with product names and rates when you have real data to support them
- Reference the live course data above in your answers
- Be concise but thorough — superintendents are busy professionals
- If recommending a spray, specify timing, rate, and any weather considerations
- Always consider the economic impact of recommendations
- Never invent numbers for data marked as unavailable above`;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { messages } = await request.json();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { content: "AI Agronomist is not configured yet. Add ANTHROPIC_API_KEY to your environment variables." },
      { status: 200 }
    );
  }

  const context = await resolveCourseIdServer(supabase);

  if (!context) {
    return NextResponse.json(
      { content: "Set up your course profile first so I can give you course-specific advice." },
      { status: 200 }
    );
  }

  try {
    const systemPrompt = await buildSystemPrompt(supabase, context.courseId);

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        system: systemPrompt,
        messages: messages.map((m: { role: string; content: string }) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Anthropic API error:", err);
      return NextResponse.json(
        { content: "I'm having trouble connecting right now. Please try again." },
        { status: 200 }
      );
    }

    const data = await res.json();
    return NextResponse.json({
      content: data.content[0].text,
    });
  } catch (error) {
    console.error("Chat error:", error);
    return NextResponse.json(
      { content: "Something went wrong. Please try again." },
      { status: 200 }
    );
  }
}
