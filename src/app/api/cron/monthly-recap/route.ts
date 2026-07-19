import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateReportData } from "@/lib/monthlyReport";

function lastCalendarMonthRange(): { start: string; end: string } {
  const now = new Date();
  const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthEnd = new Date(firstOfThisMonth.getTime() - 86400000);
  const lastMonthStart = new Date(lastMonthEnd.getFullYear(), lastMonthEnd.getMonth(), 1);

  const toDateStr = (d: Date) => d.toISOString().slice(0, 10);
  return { start: toDateStr(lastMonthStart), end: toDateStr(lastMonthEnd) };
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminClient = createAdminClient();
  const { start, end } = lastCalendarMonthRange();

  const { data: courses, error: coursesError } = await adminClient.from("courses").select("id");
  if (coursesError) {
    return NextResponse.json({ error: coursesError.message }, { status: 500 });
  }

  const results: { courseId: string; status: "generated" | "skipped" | "error" }[] = [];

  for (const course of courses ?? []) {
    try {
      const { data: existing } = await adminClient
        .from("monthly_reports")
        .select("id")
        .eq("course_id", course.id)
        .eq("period_start", start)
        .eq("period_end", end)
        .maybeSingle();

      if (existing) {
        results.push({ courseId: course.id, status: "skipped" });
        continue;
      }

      const { data: reportData, narrative } = await generateReportData(adminClient, course.id, start, end);

      const { error: insertError } = await adminClient.from("monthly_reports").insert({
        course_id: course.id,
        period_start: start,
        period_end: end,
        generated_by: "auto",
        data: reportData,
        ai_narrative: narrative,
      });

      if (insertError) {
        console.error(`Monthly recap insert error for course ${course.id}:`, insertError);
        results.push({ courseId: course.id, status: "error" });
      } else {
        results.push({ courseId: course.id, status: "generated" });
      }
    } catch (error) {
      console.error(`Monthly recap generation error for course ${course.id}:`, error);
      results.push({ courseId: course.id, status: "error" });
    }
  }

  return NextResponse.json({ period: { start, end }, results });
}
