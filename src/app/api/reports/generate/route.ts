import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCourseIdServer } from "@/lib/supabase/course-context.server";
import { generateReportData } from "@/lib/monthlyReport";

export async function POST(request: NextRequest) {
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

  if (!context.isAdminView) {
    const { data: membership } = await supabase
      .from("course_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("course_id", courseId)
      .single();
    if (!membership || (membership.role !== "owner" && membership.role !== "superintendent")) {
      return NextResponse.json({ error: "Only owners and superintendents can generate reports." }, { status: 403 });
    }
  }

  const { start_date, end_date } = (await request.json()) as { start_date?: string; end_date?: string };
  if (!start_date || !end_date) {
    return NextResponse.json({ error: "start_date and end_date are required." }, { status: 400 });
  }
  if (new Date(start_date) > new Date(end_date)) {
    return NextResponse.json({ error: "start_date must be before end_date." }, { status: 400 });
  }

  try {
    const { data, narrative } = await generateReportData(supabase, courseId, start_date, end_date);

    const { data: report, error: insertError } = await supabase
      .from("monthly_reports")
      .insert({
        course_id: courseId,
        period_start: start_date,
        period_end: end_date,
        generated_by: "manual",
        generated_by_user: user.id,
        data,
        ai_narrative: narrative,
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ report });
  } catch (error) {
    console.error("Report generation error:", error);
    return NextResponse.json({ error: "Something went wrong generating the report." }, { status: 500 });
  }
}
