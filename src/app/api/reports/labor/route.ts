import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCourseIdServer } from "@/lib/supabase/course-context.server";

function csvEscape(value: string | number): string {
  const str = String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const context = await resolveCourseIdServer(supabase, user);
  if (!context) {
    return NextResponse.json({ error: "No course found for this user." }, { status: 404 });
  }
  const courseId = context.courseId;

  if (!context.isAdminView) {
    const { data: membership } = await supabase
      .from("course_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("course_id", courseId)
      .single();
    if (!membership || (membership.role !== "owner" && membership.role !== "superintendent")) {
      return NextResponse.json({ error: "Only owners and superintendents can run the labor report." }, { status: 403 });
    }
  }

  const { searchParams } = request.nextUrl;
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  const format = searchParams.get("format") === "csv" ? "csv" : "json";
  if (!start || !end) {
    return NextResponse.json({ error: "start and end are required (YYYY-MM-DD)." }, { status: 400 });
  }

  const rangeStart = `${start}T00:00:00.000Z`;
  const nextDay = new Date(`${end}T00:00:00.000Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const rangeEndExclusive = nextDay.toISOString();

  const [{ data: tasks }, { data: employees }, { data: templates }, { data: nonBillableExpenses }, { data: payRates }] = await Promise.all([
    supabase
      .from("task_assignments")
      .select("id, name, template_id, assigned_to, started_at, completed_at, paused_minutes, estimated_minutes")
      .eq("course_id", courseId)
      .eq("status", "complete")
      .gte("completed_at", rangeStart)
      .lt("completed_at", rangeEndExclusive),
    supabase.from("employees").select("id, name").eq("course_id", courseId),
    supabase.from("task_templates").select("id, category").eq("course_id", courseId),
    supabase
      .from("expenses")
      .select("employee_id, amount")
      .eq("course_id", courseId)
      .eq("source", "non_billable_labor")
      .gte("expense_date", start)
      .lte("expense_date", end),
    supabase.from("employee_pay_rates").select("employee_id, hourly_rate"),
  ]);

  const taskIds = (tasks ?? []).map((t) => t.id);
  const { data: laborExpenses } = taskIds.length
    ? await supabase.from("expenses").select("task_assignment_id, amount").eq("source", "task_labor").in("task_assignment_id", taskIds)
    : { data: [] as { task_assignment_id: string | null; amount: number }[] };

  const employeeById = new Map((employees ?? []).map((e) => [e.id, e.name]));
  const categoryByTemplateId = new Map((templates ?? []).map((t) => [t.id, t.category]));
  const costByTaskId = new Map((laborExpenses ?? []).map((e) => [e.task_assignment_id as string, Number(e.amount)]));
  const rateByEmployeeId = new Map((payRates ?? []).map((r) => [r.employee_id, Number(r.hourly_rate)]));

  const rows = (tasks ?? [])
    .filter((t) => t.started_at && t.completed_at)
    .map((t) => {
      const actualMinutes = Math.max(
        0,
        (new Date(t.completed_at!).getTime() - new Date(t.started_at!).getTime()) / 60000 - Number(t.paused_minutes ?? 0)
      );
      const targetMinutes = t.estimated_minutes ?? null;
      const varianceMinutes = targetMinutes != null ? actualMinutes - targetMinutes : null;
      const variancePct = targetMinutes != null && targetMinutes > 0 ? ((actualMinutes - targetMinutes) / targetMinutes) * 100 : null;
      return {
        taskId: t.id,
        date: t.completed_at!.slice(0, 10),
        employeeName: t.assigned_to ? (employeeById.get(t.assigned_to) ?? "Unknown") : "Unassigned",
        taskName: t.name,
        category: t.template_id ? (categoryByTemplateId.get(t.template_id) ?? null) : null,
        targetMinutes,
        actualMinutes,
        varianceMinutes,
        variancePct,
        cost: costByTaskId.get(t.id) ?? null,
      };
    })
    .sort((a, b) => Math.abs(b.varianceMinutes ?? 0) - Math.abs(a.varianceMinutes ?? 0));

  const totals = rows.reduce(
    (acc, r) => ({
      taskCount: acc.taskCount + 1,
      targetMinutes: acc.targetMinutes + (r.targetMinutes ?? 0),
      actualMinutes: acc.actualMinutes + r.actualMinutes,
      varianceMinutes: acc.varianceMinutes + (r.varianceMinutes ?? 0),
      cost: acc.cost + (r.cost ?? 0),
    }),
    { taskCount: 0, targetMinutes: 0, actualMinutes: 0, varianceMinutes: 0, cost: 0 }
  );

  const nonBillableByEmployee = new Map<string, number>();
  for (const e of nonBillableExpenses ?? []) {
    if (!e.employee_id) continue;
    nonBillableByEmployee.set(e.employee_id, (nonBillableByEmployee.get(e.employee_id) ?? 0) + Number(e.amount));
  }
  const nonBillable = Array.from(nonBillableByEmployee.entries()).map(([employeeId, cost]) => {
    // Non-billable expenses only store the dollar amount, not minutes — back
    // the minutes out using the same hourly rate the daily reconciliation
    // used to compute the cost in the first place.
    const rate = rateByEmployeeId.get(employeeId);
    return {
      employeeName: employeeById.get(employeeId) ?? "Unknown",
      minutes: rate ? (cost / rate) * 60 : 0,
      cost,
    };
  });
  const nonBillableTotalCost = nonBillable.reduce((sum, nb) => sum + nb.cost, 0);

  const report = {
    startDate: start,
    endDate: end,
    rows,
    totals,
    nonBillable,
    nonBillableTotalCost,
  };

  if (format === "csv") {
    const header = ["Date", "Employee", "Task", "Category", "Target (min)", "Actual (min)", "Variance (min)", "Variance (%)", "Cost"];
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push(
        [
          r.date,
          csvEscape(r.employeeName),
          csvEscape(r.taskName),
          csvEscape(r.category ?? ""),
          r.targetMinutes ?? "",
          Math.round(r.actualMinutes),
          r.varianceMinutes != null ? Math.round(r.varianceMinutes) : "",
          r.variancePct != null ? Math.round(r.variancePct) : "",
          r.cost != null ? r.cost.toFixed(2) : "",
        ].join(",")
      );
    }
    lines.push("");
    lines.push(
      ["TOTALS", "", "", "", totals.targetMinutes, Math.round(totals.actualMinutes), Math.round(totals.varianceMinutes), "", totals.cost.toFixed(2)].join(
        ","
      )
    );
    return new NextResponse(lines.join("\n"), {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="turfiq-labor-report-${start}-to-${end}.csv"`,
      },
    });
  }

  return NextResponse.json(report);
}
