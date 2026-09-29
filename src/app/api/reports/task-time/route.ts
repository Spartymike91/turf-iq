import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCourseIdServer } from "@/lib/supabase/course-context.server";
import { actualMinutesFor } from "@/lib/taskDuration";

function csvEscape(value: string | number): string {
  const str = String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

// Robert's second ask, right after editable task time (which this depends
// on): not a per-task-instance ledger like /api/reports/labor, but
// accumulated by task NAME — "at end of year be able to see they spent X
// hours mowing fairways." One row per distinct task name in the range,
// with count/average/total actual duration, so the report answers "where
// does our time actually go" rather than "how did this one task do."
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
      return NextResponse.json({ error: "Only owners and superintendents can run the task time report." }, { status: 403 });
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

  const { data: tasks } = await supabase
    .from("task_assignments")
    .select("id, name, started_at, completed_at, paused_minutes, estimated_minutes, actual_minutes_override")
    .eq("course_id", courseId)
    .eq("status", "complete")
    .gte("completed_at", rangeStart)
    .lt("completed_at", rangeEndExclusive);

  const groups = new Map<
    string,
    { count: number; totalActualMinutes: number; totalTargetMinutes: number; targetCount: number }
  >();

  for (const t of tasks ?? []) {
    const actual = actualMinutesFor(t);
    if (actual == null) continue; // no started_at/completed_at and no override — nothing to accumulate
    const existing = groups.get(t.name) ?? { count: 0, totalActualMinutes: 0, totalTargetMinutes: 0, targetCount: 0 };
    existing.count += 1;
    existing.totalActualMinutes += actual;
    if (t.estimated_minutes != null) {
      existing.totalTargetMinutes += t.estimated_minutes;
      existing.targetCount += 1;
    }
    groups.set(t.name, existing);
  }

  const rows = Array.from(groups.entries())
    .map(([taskName, g]) => ({
      taskName,
      count: g.count,
      totalActualMinutes: g.totalActualMinutes,
      avgActualMinutes: g.totalActualMinutes / g.count,
      totalTargetMinutes: g.targetCount > 0 ? g.totalTargetMinutes : null,
      avgTargetMinutes: g.targetCount > 0 ? g.totalTargetMinutes / g.targetCount : null,
    }))
    .sort((a, b) => b.totalActualMinutes - a.totalActualMinutes);

  const totals = rows.reduce(
    (acc, r) => ({
      taskCount: acc.taskCount + r.count,
      totalActualMinutes: acc.totalActualMinutes + r.totalActualMinutes,
    }),
    { taskCount: 0, totalActualMinutes: 0 }
  );

  const report = { startDate: start, endDate: end, rows, totals };

  if (format === "csv") {
    const header = ["Task", "Completions", "Avg Actual (min)", "Total Actual (min)", "Avg Target (min)", "Total Target (min)"];
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push(
        [
          csvEscape(r.taskName),
          r.count,
          Math.round(r.avgActualMinutes),
          Math.round(r.totalActualMinutes),
          r.avgTargetMinutes != null ? Math.round(r.avgTargetMinutes) : "",
          r.totalTargetMinutes != null ? Math.round(r.totalTargetMinutes) : "",
        ].join(",")
      );
    }
    lines.push("");
    lines.push(["TOTALS", totals.taskCount, "", Math.round(totals.totalActualMinutes), "", ""].join(","));
    return new NextResponse(lines.join("\n"), {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="turfiq-task-time-report-${start}-to-${end}.csv"`,
      },
    });
  }

  return NextResponse.json(report);
}
