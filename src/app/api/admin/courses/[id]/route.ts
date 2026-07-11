import { NextRequest, NextResponse } from "next/server";
import { getPlatformAdminSession } from "@/lib/supabase/platform-admin";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, isPlatformAdmin } = await getPlatformAdminSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isPlatformAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const adminClient = createAdminClient();

  const { data: course, error: courseError } = await adminClient
    .from("courses")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (courseError) return NextResponse.json({ error: courseError.message }, { status: 500 });
  if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 });

  const { data: memberRows } = await adminClient
    .from("course_members")
    .select("id, user_id, role, created_at")
    .eq("course_id", id);

  const userIds = (memberRows ?? []).map((m) => m.user_id);
  const { data: profileRows } = userIds.length
    ? await adminClient.from("profiles").select("id, full_name, email, phone").in("id", userIds)
    : { data: [] };
  const profileById = new Map((profileRows ?? []).map((p) => [p.id, p]));

  const roster = (memberRows ?? []).map((m) => ({
    ...m,
    full_name: profileById.get(m.user_id)?.full_name ?? null,
    email: profileById.get(m.user_id)?.email ?? null,
    phone: profileById.get(m.user_id)?.phone ?? null,
  }));

  const [{ count: employeeCount }, { count: taskCount }] = await Promise.all([
    adminClient.from("employees").select("id", { count: "exact", head: true }).eq("course_id", id),
    adminClient.from("task_assignments").select("id", { count: "exact", head: true }).eq("course_id", id),
  ]);

  const { data: waivedByProfile } = course.billing_waived_by
    ? await adminClient.from("profiles").select("full_name, email").eq("id", course.billing_waived_by).maybeSingle()
    : { data: null };

  return NextResponse.json({
    course: { ...course, billing_waived_by_name: waivedByProfile?.full_name ?? waivedByProfile?.email ?? null },
    roster,
    employee_count: employeeCount ?? 0,
    task_count: taskCount ?? 0,
  });
}
