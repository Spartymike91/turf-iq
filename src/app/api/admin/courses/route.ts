import { NextResponse } from "next/server";
import { getPlatformAdminSession } from "@/lib/supabase/platform-admin";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const { user, isPlatformAdmin } = await getPlatformAdminSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isPlatformAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const adminClient = createAdminClient();

  const { data: courses, error: coursesError } = await adminClient
    .from("courses")
    // TODO: once Stripe billing lands, add plan_tier here
    .select("id, name, city, state, num_holes, maintained_acres, annual_rounds, created_at")
    .order("created_at", { ascending: false });
  if (coursesError) {
    return NextResponse.json({ error: coursesError.message }, { status: 500 });
  }

  const { data: members } = await adminClient
    .from("course_members")
    .select("course_id, user_id, role");

  const ownerUserIds = [...new Set((members ?? []).filter((m) => m.role === "owner").map((m) => m.user_id))];
  const { data: profiles } = ownerUserIds.length
    ? await adminClient.from("profiles").select("id, full_name, email").in("id", ownerUserIds)
    : { data: [] };
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  const memberCountByCourseId = new Map<string, number>();
  const ownerByCourseId = new Map<string, { full_name: string | null; email: string | null }>();
  for (const m of members ?? []) {
    memberCountByCourseId.set(m.course_id, (memberCountByCourseId.get(m.course_id) ?? 0) + 1);
    if (m.role === "owner") {
      const p = profileById.get(m.user_id);
      ownerByCourseId.set(m.course_id, { full_name: p?.full_name ?? null, email: p?.email ?? null });
    }
  }

  const result = (courses ?? []).map((c) => ({
    ...c,
    member_count: memberCountByCourseId.get(c.id) ?? 0,
    owner: ownerByCourseId.get(c.id) ?? null,
  }));

  return NextResponse.json({ courses: result });
}
