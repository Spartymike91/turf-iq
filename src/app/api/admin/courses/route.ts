import { NextRequest, NextResponse } from "next/server";
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

interface NewCourseBody {
  name?: string;
  city?: string;
  state?: string;
  grass_type?: string;
  climate_zone?: string;
  num_holes?: string | number;
  maintained_acres?: string | number;
  owner_email?: string;
  owner_full_name?: string;
}

export async function POST(request: NextRequest) {
  const { user, isPlatformAdmin } = await getPlatformAdminSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isPlatformAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json()) as NewCourseBody;
  const { name, city, state, grass_type, climate_zone, num_holes, maintained_acres, owner_email, owner_full_name } = body;

  if (!name || !owner_email) {
    return NextResponse.json({ error: "Course name and owner email are required." }, { status: 400 });
  }

  const adminClient = createAdminClient();

  const { data: existingProfile } = await adminClient
    .from("profiles")
    .select("id, email")
    .ilike("email", owner_email)
    .maybeSingle();

  if (existingProfile) {
    const { data: existingMembership } = await adminClient
      .from("course_members")
      .select("id, course_id")
      .eq("user_id", existingProfile.id)
      .maybeSingle();

    if (existingMembership) {
      return NextResponse.json(
        { error: "This person already belongs to a course. Turf IQ supports one course per account today." },
        { status: 409 }
      );
    }
  }

  const courseId = crypto.randomUUID();
  const { error: courseError } = await adminClient.from("courses").insert({
    id: courseId,
    name,
    city: city || null,
    state: state || null,
    grass_type: grass_type || null,
    climate_zone: climate_zone || null,
    num_holes: num_holes ? parseInt(String(num_holes)) : null,
    maintained_acres: maintained_acres ? parseFloat(String(maintained_acres)) : null,
  });
  if (courseError) {
    return NextResponse.json({ error: courseError.message }, { status: 500 });
  }

  if (existingProfile) {
    const { error: memberError } = await adminClient.from("course_members").insert({
      course_id: courseId,
      user_id: existingProfile.id,
      role: "owner",
    });
    if (memberError) return NextResponse.json({ error: memberError.message }, { status: 500 });
    return NextResponse.json({ mode: "added_existing", course_id: courseId });
  }

  const origin = request.headers.get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(owner_email, {
    redirectTo: `${origin}/accept-invite`,
    data: owner_full_name ? { full_name: owner_full_name } : undefined,
  });

  if (inviteError || !invited?.user) {
    return NextResponse.json({ error: inviteError?.message ?? "Failed to send invite." }, { status: 400 });
  }

  const { error: memberError } = await adminClient.from("course_members").insert({
    course_id: courseId,
    user_id: invited.user.id,
    role: "owner",
  });
  if (memberError) return NextResponse.json({ error: memberError.message }, { status: 500 });

  return NextResponse.json({ mode: "invited_new", course_id: courseId });
}
