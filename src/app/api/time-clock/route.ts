import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveCourseIdServer } from "@/lib/supabase/course-context.server";

// Self-service clock in/out for the Live Status board — deliberately
// separate from the manager-operated /tasks/time-clock page, whose
// time_entries RLS policies only allow owner/superintendent to
// INSERT/UPDATE (that page assumes a shared kiosk, not individual crew
// sessions). Rather than loosen that policy, this route resolves the
// caller's own employee row server-side and writes with the service-role
// client after its own authorization check — the same pattern already used
// by /api/tasks/start and /api/tasks/complete for crew acting on their own
// behalf.
export async function POST(request: NextRequest) {
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

  const { action } = (await request.json()) as { action?: "clock_in" | "clock_out" };
  if (action !== "clock_in" && action !== "clock_out") {
    return NextResponse.json({ error: "action must be \"clock_in\" or \"clock_out\"." }, { status: 400 });
  }

  const adminClient = createAdminClient();

  const { data: membership } = await supabase
    .from("course_members")
    .select("id")
    .eq("user_id", user.id)
    .eq("course_id", courseId)
    .single();
  if (!membership) {
    return NextResponse.json({ error: "No course found for this user." }, { status: 404 });
  }

  const { data: employee } = await adminClient
    .from("employees")
    .select("id")
    .eq("course_member_id", membership.id)
    .eq("course_id", courseId)
    .maybeSingle();
  if (!employee) {
    return NextResponse.json({ error: "No employee record linked to your account." }, { status: 404 });
  }

  const { data: openEntry } = await adminClient
    .from("time_entries")
    .select("id")
    .eq("employee_id", employee.id)
    .is("clock_out", null)
    .maybeSingle();

  if (action === "clock_in") {
    if (openEntry) {
      return NextResponse.json({ error: "Already clocked in." }, { status: 409 });
    }
    const { data: entry, error: insertError } = await adminClient
      .from("time_entries")
      .insert({ course_id: courseId, employee_id: employee.id })
      .select()
      .single();
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
    return NextResponse.json({ entry });
  }

  // action === "clock_out"
  if (!openEntry) {
    return NextResponse.json({ error: "Not currently clocked in." }, { status: 404 });
  }
  const { data: entry, error: updateError } = await adminClient
    .from("time_entries")
    .update({ clock_out: new Date().toISOString() })
    .eq("id", openEntry.id)
    .select()
    .single();
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }
  return NextResponse.json({ entry });
}
