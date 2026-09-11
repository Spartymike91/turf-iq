import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const NON_BILLABLE_CATEGORY = "Non-Billable Labor";

// Yesterday's local calendar day, as a [start, end) datetime range plus its
// DATE-column string — run the morning after so every clock-out from that
// day has already happened.
function targetDayRange() {
  const start = new Date();
  start.setDate(start.getDate() - 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end, dateStr: start.toISOString().slice(0, 10) };
}

async function findOrCreateCategory(
  adminClient: ReturnType<typeof createAdminClient>,
  courseId: string,
  name: string,
  fiscalYear: number
) {
  const { data: existing } = await adminClient
    .from("budget_categories")
    .select("id")
    .eq("course_id", courseId)
    .eq("name", name)
    .eq("fiscal_year", fiscalYear)
    .maybeSingle();
  if (existing) return existing.id as string;

  const { data: created, error } = await adminClient
    .from("budget_categories")
    .insert({ course_id: courseId, name, fiscal_year: fiscalYear, annual_budget: 0 })
    .select("id")
    .single();
  if (error) throw error;
  return created.id as string;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminClient = createAdminClient();
  const { start, end, dateStr } = targetDayRange();
  const fiscalYear = start.getFullYear();

  const { data: courses, error: coursesError } = await adminClient.from("courses").select("id");
  if (coursesError) {
    return NextResponse.json({ error: coursesError.message }, { status: 500 });
  }

  const results: { courseId: string; employeeId: string; status: "written" | "skipped" | "error" }[] = [];

  for (const course of courses ?? []) {
    try {
      const [{ data: employees }, { data: entries }, { data: tasksCompleted }] = await Promise.all([
        adminClient
          .from("employees")
          .select("id, name, is_active")
          .eq("course_id", course.id)
          .eq("is_active", true),
        adminClient
          .from("time_entries")
          .select("employee_id, clock_in, clock_out")
          .eq("course_id", course.id)
          .gte("clock_in", start.toISOString())
          .lt("clock_in", end.toISOString()),
        adminClient
          .from("task_assignments")
          .select("assigned_to, started_at, completed_at, paused_minutes")
          .eq("course_id", course.id)
          .eq("status", "complete")
          .gte("completed_at", start.toISOString())
          .lt("completed_at", end.toISOString()),
      ]);

      for (const employee of employees ?? []) {
        try {
          const { data: rateRow } = await adminClient
            .from("employee_pay_rates")
            .select("hourly_rate")
            .eq("employee_id", employee.id)
            .maybeSingle();
          if (!rateRow) {
            results.push({ courseId: course.id, employeeId: employee.id, status: "skipped" });
            continue;
          }

          // Any entry still open (forgot to clock out) is skipped entirely
          // rather than estimated forward — same "don't guess" principle
          // /api/tasks/complete already uses for labor cost.
          const clockedMinutes = (entries ?? [])
            .filter((e) => e.employee_id === employee.id && e.clock_out)
            .reduce((sum, e) => sum + (new Date(e.clock_out!).getTime() - new Date(e.clock_in).getTime()) / 60000, 0);

          const taskMinutes = (tasksCompleted ?? [])
            .filter((t) => t.assigned_to === employee.id && t.started_at)
            .reduce((sum, t) => {
              const raw = (new Date(t.completed_at!).getTime() - new Date(t.started_at!).getTime()) / 60000;
              return sum + Math.max(0, raw - Number(t.paused_minutes ?? 0));
            }, 0);

          const unaccountedMinutes = Math.max(0, clockedMinutes - taskMinutes);
          const cost = Math.round((unaccountedMinutes / 60) * Number(rateRow.hourly_rate) * 100) / 100;
          if (cost <= 0) {
            results.push({ courseId: course.id, employeeId: employee.id, status: "skipped" });
            continue;
          }

          const { data: existing } = await adminClient
            .from("expenses")
            .select("id")
            .eq("course_id", course.id)
            .eq("employee_id", employee.id)
            .eq("expense_date", dateStr)
            .eq("source", "non_billable_labor")
            .maybeSingle();
          if (existing) {
            results.push({ courseId: course.id, employeeId: employee.id, status: "skipped" });
            continue;
          }

          const categoryId = await findOrCreateCategory(adminClient, course.id, NON_BILLABLE_CATEGORY, fiscalYear);
          const { error: insertError } = await adminClient.from("expenses").insert({
            course_id: course.id,
            category_id: categoryId,
            employee_id: employee.id,
            amount: cost,
            description: `${employee.name} — non-billable time (${Math.round(clockedMinutes)}m clocked, ${Math.round(
              taskMinutes
            )}m on tasks)`,
            expense_date: dateStr,
            source: "non_billable_labor",
          });
          results.push({
            courseId: course.id,
            employeeId: employee.id,
            status: insertError ? "error" : "written",
          });
        } catch (error) {
          console.error(`Daily labor recap error for employee ${employee.id}:`, error);
          results.push({ courseId: course.id, employeeId: employee.id, status: "error" });
        }
      }
    } catch (error) {
      console.error(`Daily labor recap error for course ${course.id}:`, error);
      results.push({ courseId: course.id, employeeId: "", status: "error" });
    }
  }

  return NextResponse.json({ date: dateStr, results });
}
