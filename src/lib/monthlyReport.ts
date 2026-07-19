import type { SupabaseClient } from "@supabase/supabase-js";
import { getDueStatus } from "@/lib/equipmentModels";

const SYSTEM_PROMPT = `You are the Turf IQ AI Agronomist, writing a monthly recap narrative for a golf course superintendent based ONLY on the real data provided below. This report is used to explain outcomes to ownership/greens committees — e.g. connecting a budget shortfall to a disease outbreak, or a skipped spray to elevated pressure. Only draw connections the data actually supports; never invent figures or dates. If disease-risk history says "no historical data logged," say so plainly rather than guessing at what disease pressure might have been.

Respond with ONLY a JSON object (no prose, no markdown fences) shaped exactly:
{ "narrative": string }

"narrative": 3-6 sentences, plain text (no markdown). Lead with the most consequential fact (over/under budget, a disease event, a missed maintenance window). Where the data supports a cause-and-effect explanation, state it as a plausible explanation, not a certainty (e.g. "likely contributed to" rather than "caused").`;

export interface ReportData {
  periodStart: string;
  periodEnd: string;
  expenses: {
    totalBudgetProRated: number;
    totalSpent: number;
    byCategory: { name: string; budgetProRated: number; spent: number }[];
  };
  disease: {
    noHistoricalData: boolean;
    daysLogged: number;
    daysAboveDollarSpotThreshold: number;
    avgDollarSpotPct: number | null;
    daysPythiumElevated: number;
    daysBrownPatchElevated: number;
  };
  pestApplications: { applied_at: string; target: string; product: string }[];
  fertilizerApplications: { application_date: string; product: string; n_lbs_per_1000: number }[];
  equipment: {
    completedMaintenance: { equipmentName: string; task: string; performed_at: string; cost: number | null }[];
    currentIssues: { equipmentName: string; task: string; status: "OVERDUE" | "DUE SOON"; hoursRemaining: number | null; daysRemaining: number | null }[];
  };
}

export interface GeneratedReport {
  data: ReportData;
  narrative: string;
}

export async function generateReportData(
  supabase: SupabaseClient,
  courseId: string,
  startDate: string,
  endDate: string
): Promise<GeneratedReport> {
  const { data: course } = await supabase
    .from("courses")
    .select("name, city, state, grass_type")
    .eq("id", courseId)
    .single();

  const start = new Date(startDate);
  const end = new Date(endDate);
  const rangeDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  const fiscalYear = start.getFullYear();
  const daysInFiscalYear = ((y: number) => ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365))(fiscalYear);

  const { data: budgetCategories } = await supabase
    .from("budget_categories")
    .select("id, name, annual_budget")
    .eq("course_id", courseId)
    .eq("fiscal_year", fiscalYear);

  const { data: expenseRows } = await supabase
    .from("expenses")
    .select("category_id, amount")
    .eq("course_id", courseId)
    .gte("expense_date", startDate)
    .lte("expense_date", endDate);

  const spentByCategory: Record<string, number> = {};
  for (const e of expenseRows ?? []) {
    spentByCategory[e.category_id] = (spentByCategory[e.category_id] ?? 0) + Number(e.amount);
  }

  const byCategory = (budgetCategories ?? []).map((c) => ({
    name: c.name,
    budgetProRated: (Number(c.annual_budget) / daysInFiscalYear) * rangeDays,
    spent: spentByCategory[c.id] ?? 0,
  }));

  const expenses = {
    totalBudgetProRated: byCategory.reduce((s, c) => s + c.budgetProRated, 0),
    totalSpent: byCategory.reduce((s, c) => s + c.spent, 0),
    byCategory,
  };

  const { data: diseaseRows } = await supabase
    .from("disease_risk_daily_log")
    .select("dollar_spot_pct, dollar_spot_above_threshold, pythium_elevated, brown_patch_elevated")
    .eq("course_id", courseId)
    .gte("log_date", startDate)
    .lte("log_date", endDate);

  const diseaseRowsList = diseaseRows ?? [];
  const disease = {
    noHistoricalData: diseaseRowsList.length === 0,
    daysLogged: diseaseRowsList.length,
    daysAboveDollarSpotThreshold: diseaseRowsList.filter((r) => r.dollar_spot_above_threshold).length,
    avgDollarSpotPct:
      diseaseRowsList.length > 0
        ? diseaseRowsList.reduce((s, r) => s + Number(r.dollar_spot_pct), 0) / diseaseRowsList.length
        : null,
    daysPythiumElevated: diseaseRowsList.filter((r) => r.pythium_elevated).length,
    daysBrownPatchElevated: diseaseRowsList.filter((r) => r.brown_patch_elevated).length,
  };

  const { data: pestApplications } = await supabase
    .from("pest_applications")
    .select("applied_at, target, product")
    .eq("course_id", courseId)
    .gte("applied_at", startDate)
    .lte("applied_at", `${endDate}T23:59:59`)
    .order("applied_at", { ascending: false });

  const { data: fertilizerApplications } = await supabase
    .from("fertilizer_applications")
    .select("application_date, product, n_lbs_per_1000")
    .eq("course_id", courseId)
    .gte("application_date", startDate)
    .lte("application_date", endDate)
    .order("application_date", { ascending: false });

  const { data: equipmentList } = await supabase
    .from("equipment")
    .select("id, name, current_hours")
    .eq("course_id", courseId)
    .eq("is_active", true);

  let completedMaintenance: ReportData["equipment"]["completedMaintenance"] = [];
  const currentIssues: ReportData["equipment"]["currentIssues"] = [];

  if (equipmentList && equipmentList.length > 0) {
    const equipmentIds = equipmentList.map((e) => e.id);
    const [{ data: scheduleItems }, { data: maintenanceLogs }] = await Promise.all([
      supabase.from("maintenance_schedule_items").select("*").in("equipment_id", equipmentIds),
      supabase.from("maintenance_log").select("*").in("equipment_id", equipmentIds),
    ]);

    completedMaintenance = (maintenanceLogs ?? [])
      .filter((l) => l.performed_at >= startDate && l.performed_at <= endDate)
      .map((l) => ({
        equipmentName: equipmentList.find((e) => e.id === l.equipment_id)?.name ?? "Unknown",
        task: l.task,
        performed_at: l.performed_at,
        cost: l.cost != null ? Number(l.cost) : null,
      }));

    for (const item of scheduleItems ?? []) {
      const eq = equipmentList.find((e) => e.id === item.equipment_id);
      if (!eq) continue;
      const due = getDueStatus(item, eq, maintenanceLogs ?? []);
      if (due.status !== "OK") {
        currentIssues.push({
          equipmentName: eq.name,
          task: item.task,
          status: due.status,
          hoursRemaining: due.hoursRemaining,
          daysRemaining: due.daysRemaining,
        });
      }
    }
  }

  const reportData: ReportData = {
    periodStart: startDate,
    periodEnd: endDate,
    expenses,
    disease,
    pestApplications: pestApplications ?? [],
    fertilizerApplications: fertilizerApplications ?? [],
    equipment: { completedMaintenance, currentIssues },
  };

  const promptSections = [
    `COURSE: ${course?.name ?? "—"}, ${course?.city ?? "—"}, ${course?.state ?? "—"} · ${course?.grass_type ?? "grass type not set"}`,
    `PERIOD: ${startDate} to ${endDate} (${rangeDays} days)`,
    `EXPENSES: budget (pro-rated for period) $${expenses.totalBudgetProRated.toFixed(2)} vs. actual $${expenses.totalSpent.toFixed(2)}. By category: ${
      byCategory.length > 0
        ? byCategory.map((c) => `${c.name} — budget $${c.budgetProRated.toFixed(2)}, spent $${c.spent.toFixed(2)}`).join("; ")
        : "no categories set"
    }`,
    disease.noHistoricalData
      ? "DISEASE RISK: no historical data logged for this period (daily logging only started recently) — do not speculate about disease pressure during this window."
      : `DISEASE RISK: ${disease.daysLogged} days logged. Dollar Spot above action threshold on ${disease.daysAboveDollarSpotThreshold} of those days (avg ${disease.avgDollarSpotPct?.toFixed(1)}%). Pythium elevated ${disease.daysPythiumElevated} days. Brown Patch elevated ${disease.daysBrownPatchElevated} days.`,
    `PEST/HERBICIDE APPLICATIONS: ${
      reportData.pestApplications.length > 0
        ? reportData.pestApplications.map((a) => `${a.target} (${a.product}) on ${new Date(a.applied_at).toLocaleDateString()}`).join("; ")
        : "none logged during this period"
    }`,
    `FERTILIZER APPLICATIONS: ${
      reportData.fertilizerApplications.length > 0
        ? reportData.fertilizerApplications.map((a) => `${a.product} (${a.n_lbs_per_1000} lbs/M N) on ${new Date(a.application_date).toLocaleDateString()}`).join("; ")
        : "none logged during this period"
    }`,
    `EQUIPMENT MAINTENANCE COMPLETED THIS PERIOD: ${
      completedMaintenance.length > 0
        ? completedMaintenance.map((m) => `${m.equipmentName} — ${m.task} on ${new Date(m.performed_at).toLocaleDateString()}`).join("; ")
        : "none logged during this period"
    }`,
    `EQUIPMENT STATUS AS OF TODAY (current, not historical): ${
      currentIssues.length > 0
        ? currentIssues.map((i) => `${i.equipmentName} — ${i.task} (${i.status})`).join("; ")
        : "no overdue or due-soon items"
    }`,
  ];

  let narrative =
    "AI narrative unavailable — review the figures above directly.";

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
          max_tokens: 500,
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
        if (parsed && typeof parsed.narrative === "string") {
          narrative = parsed.narrative;
        }
      } else {
        console.error("Monthly report Anthropic API error:", await res.text());
      }
    } catch (error) {
      console.error("Monthly report narrative generation error:", error);
    }
  }

  return { data: reportData, narrative };
}
