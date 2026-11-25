import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCourseIdServer } from "@/lib/supabase/course-context.server";
import { buildCourseExport } from "@/lib/dataExport";
import { buildXlsx } from "@/lib/xlsx";
import { localToday } from "@/lib/taskNotify";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
      return NextResponse.json({ error: "Only owners and superintendents can export course data." }, { status: 403 });
    }

    // The export includes pay rates, which stay locked behind the PIN. Without
    // this check the database would simply return none of them.
    const { data: elevated } = await supabase.rpc("is_sensitive_data_elevated");
    if (!elevated) {
      return NextResponse.json(
        { error: "Enter your PIN to export. The export includes pay rates.", needsPin: true },
        { status: 403 }
      );
    }
  }

  try {
    const { courseName, sheets } = await buildCourseExport(supabase, courseId);
    const slug = courseName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

    return new NextResponse(new Uint8Array(buildXlsx(sheets)), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="turfiq-export-${slug}-${localToday()}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("export error:", err);
    return NextResponse.json({ error: "Could not export data." }, { status: 500 });
  }
}
