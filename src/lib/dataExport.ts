import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_CELL_CHARS, type Cell, type Sheet } from "./xlsx";

// Everything a course owns, gathered into one spreadsheet so customers are
// never locked in — the mirror image of importing data in. Uses the caller's
// own session-scoped client, so normal RLS applies. Pay rates are only
// readable while the caller has unlocked sensitive data with their PIN; the
// route checks that first, because RLS would otherwise just return no rows.
//
// When you add a course-scoped table to the app, add it here too.

type Row = Record<string, unknown>;

const PAGE_SIZE = 1000; // Supabase returns at most this many rows per request
const ID_BATCH = 100; // keeps `in (...)` filters inside URL length limits

type Page = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;

// Reads every row, and throws on any error: a failed query must never turn
// into a silently empty tab.
async function fetchAll(label: string, page: (from: number, to: number) => Page): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Export failed reading ${label}: ${error.message}`);
    rows.push(...((data ?? []) as Row[]));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

async function fetchByIds(label: string, ids: string[], page: (batch: string[], from: number, to: number) => Page) {
  const rows: Row[] = [];
  for (let i = 0; i < ids.length; i += ID_BATCH) {
    const batch = ids.slice(i, i + ID_BATCH);
    rows.push(...(await fetchAll(label, (from, to) => page(batch, from, to))));
  }
  return rows;
}

const idsOf = (rows: Row[], key = "id") => rows.map((r) => r[key]).filter((v): v is string => typeof v === "string");

const nameMap = (rows: Row[], label: (row: Row) => unknown, key = "id") =>
  new Map(rows.map((r) => [r[key] as string, String(label(r) ?? "")]));

// Adds a readable column right after an ID column, so the spreadsheet still
// makes sense outside Turf IQ.
function withNames(rows: Row[], lookups: Record<string, [string, Map<string, string>]>): Row[] {
  return rows.map((row) => {
    const out: Row = {};
    for (const [key, value] of Object.entries(row)) {
      out[key] = value;
      const lookup = lookups[key];
      if (lookup) out[lookup[0]] = value ? (lookup[1].get(value as string) ?? "") : "";
    }
    return out;
  });
}

function toCell(value: unknown): Cell {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return JSON.stringify(value);
}

function toSheet(name: string, rows: Row[]): Sheet {
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  if (keys.length === 0) return { name, columns: ["(no records)"], rows: [] };

  // Text too long for one cell carries on into "(part 2)" etc. columns.
  const cells = rows.map((r) => keys.map((k) => toCell(r[k])));
  const parts = keys.map((_, i) =>
    cells.reduce((max, row) => {
      const v = row[i];
      return typeof v === "string" ? Math.max(max, Math.ceil(v.length / MAX_CELL_CHARS)) : max;
    }, 1)
  );

  return {
    name,
    columns: keys.flatMap((k, i) => Array.from({ length: parts[i] }, (_, p) => (p ? `${k} (part ${p + 1})` : k))),
    rows: cells.map((row) =>
      row.flatMap((v, i) =>
        parts[i] === 1
          ? [v]
          : Array.from({ length: parts[i] }, (_, p) =>
              typeof v === "string" ? v.slice(p * MAX_CELL_CHARS, (p + 1) * MAX_CELL_CHARS) : p ? null : v
            )
      )
    ),
  };
}

export async function buildCourseExport(
  supabase: SupabaseClient,
  courseId: string
): Promise<{ courseName: string; sheets: Sheet[] }> {
  const table = (name: string) =>
    fetchAll(name, (from, to) => supabase.from(name).select("*").eq("course_id", courseId).order("id").range(from, to));

  const [
    courseResult,
    members,
    employees,
    budgetCategories,
    expenses,
    products,
    fertilityPrograms,
    fertilizerApplications,
    pestApplications,
    soilTests,
    soilMoisture,
    irrigationPrograms,
    irrigationLogs,
    rainfall,
    gdd,
    diseaseRisk,
    taskTemplates,
    taskAssignments,
    timeEntries,
    calendarEvents,
    equipment,
    mapNotes,
    dailyLogNotes,
    chatThreads,
    monthlyReports,
  ] = await Promise.all([
    supabase.from("courses").select("*").eq("id", courseId).single(),
    table("course_members"),
    table("employees"),
    table("budget_categories"),
    table("expenses"),
    table("products"),
    table("fertility_programs"),
    table("fertilizer_applications"),
    table("pest_applications"),
    table("soil_tests"),
    table("soil_moisture_readings"),
    table("irrigation_programs"),
    table("irrigation_logs"),
    table("rainfall_daily_log"),
    table("gdd_daily_log"),
    table("disease_risk_daily_log"),
    table("task_templates"),
    table("task_assignments"),
    table("time_entries"),
    table("calendar_events"),
    table("equipment"),
    table("course_map_notes"),
    table("daily_log_notes"),
    table("chat_threads"),
    table("monthly_reports"),
  ]);
  if (courseResult.error) throw new Error(`Export failed reading courses: ${courseResult.error.message}`);

  const equipmentIds = idsOf(equipment);
  const equipmentChild = (name: string) =>
    fetchByIds(name, equipmentIds, (batch, from, to) =>
      supabase.from(name).select("*").in("equipment_id", batch).order("id").range(from, to)
    );

  // Only the team-wide channel. One-on-one messages stay private to the two
  // people in them.
  const teamThreadIds = idsOf(chatThreads.filter((t) => t.kind === "general"));

  const [profiles, payRates, serviceItems, serviceLog, messages] = await Promise.all([
    // course_members has no direct database relationship to profiles, so
    // names and emails are looked up separately.
    fetchByIds("profiles", idsOf(members, "user_id"), (batch, from, to) =>
      supabase.from("profiles").select("id, full_name, email").in("id", batch).order("id").range(from, to)
    ),
    fetchByIds("employee_pay_rates", idsOf(employees), (batch, from, to) =>
      supabase.from("employee_pay_rates").select("*").in("employee_id", batch).order("employee_id").range(from, to)
    ),
    equipmentChild("maintenance_schedule_items"),
    equipmentChild("maintenance_log"),
    fetchByIds("chat_messages", teamThreadIds, (batch, from, to) =>
      supabase.from("chat_messages").select("*").in("thread_id", batch).order("created_at").order("id").range(from, to)
    ),
  ]);

  const userNames = nameMap(profiles, (p) => p.full_name || p.email);
  const profileById = new Map(profiles.map((p) => [p.id as string, p]));
  const memberNames = nameMap(members, (m) => userNames.get(m.user_id as string));
  const employeeNames = nameMap(employees, (e) => e.name);
  const productNames = nameMap(products, (p) => p.name);
  const equipmentNames = nameMap(equipment, (e) => e.name);
  const categoryNames = nameMap(budgetCategories, (c) => c.name);
  const templateNames = nameMap(taskTemplates, (t) => t.name);
  const payRateByEmployee = new Map(payRates.map((r) => [r.employee_id as string, r.hourly_rate]));

  // Internal billing references are Turf IQ's, not the course's.
  const course = { ...(courseResult.data as Row) };
  for (const key of ["stripe_customer_id", "stripe_subscription_id", "billing_waived_by"]) delete course[key];

  const byEmployee: [string, Map<string, string>] = ["employee_name", employeeNames];
  const byProduct: [string, Map<string, string>] = ["product_name", productNames];
  const byEquipment: [string, Map<string, string>] = ["equipment_name", equipmentNames];

  const data: [string, Row[]][] = [
    ["Course", [course]],
    [
      "Team",
      members.map((m) => ({
        id: m.id,
        full_name: profileById.get(m.user_id as string)?.full_name ?? "",
        email: profileById.get(m.user_id as string)?.email ?? "",
        role: m.role,
        title: m.title,
        allowed_modules: m.allowed_modules,
        created_at: m.created_at,
      })),
    ],
    ["Employees", employees.map((e) => ({ ...e, hourly_rate: payRateByEmployee.get(e.id as string) ?? null }))],
    [
      "Task assignments",
      withNames(taskAssignments, {
        assigned_to: ["assigned_to_name", employeeNames],
        template_id: ["template_name", templateNames],
      }),
    ],
    ["Task library", taskTemplates],
    ["Time entries", withNames(timeEntries, { employee_id: byEmployee })],
    ["Calendar events", withNames(calendarEvents, { employee_id: byEmployee })],
    ["Budget categories", budgetCategories],
    [
      "Expenses",
      withNames(expenses, { category_id: ["category_name", categoryNames], employee_id: byEmployee }),
    ],
    ["Product inventory", products],
    ["Fertility programs", fertilityPrograms],
    ["Fertilizer applications", withNames(fertilizerApplications, { product_id: byProduct })],
    ["Pest applications", withNames(pestApplications, { product_id: byProduct })],
    ["Soil tests", soilTests],
    ["Soil moisture", soilMoisture],
    ["Irrigation programs", irrigationPrograms],
    ["Irrigation logs", irrigationLogs],
    ["Rainfall", rainfall],
    ["Growing degree days", gdd],
    ["Disease risk", diseaseRisk],
    ["Equipment", equipment],
    ["Maintenance schedule", withNames(serviceItems, { equipment_id: byEquipment })],
    ["Maintenance log", withNames(serviceLog, { equipment_id: byEquipment })],
    ["Course map notes", withNames(mapNotes, { created_by: ["created_by_name", memberNames] })],
    ["Daily log notes", withNames(dailyLogNotes, { updated_by: ["updated_by_name", memberNames] })],
    ["Team chat messages", withNames(messages, { sender_id: ["sender_name", memberNames] })],
    ["Monthly reports", withNames(monthlyReports, { generated_by_user: ["generated_by_name", userNames] })],
  ];

  const about: Sheet = {
    name: "About",
    columnWidth: 48,
    columns: ["Tab", "Records"],
    rows: [
      ...data.map(([name, rows]): Cell[] => [name, rows.length]),
      [],
      ["Exported (UTC)", new Date().toISOString()],
      ["Dates and times", "Times are in UTC."],
      ["Photos and files", "The platform does not store uploaded photos or files."],
      ["Private messages", "One-on-one messages are not included. Only the team-wide channel is."],
    ],
  };

  return {
    courseName: (course.name as string | undefined) ?? "course",
    sheets: [about, ...data.map(([name, rows]) => toSheet(name, rows))],
  };
}
