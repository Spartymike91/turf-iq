import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type Role = "owner" | "superintendent" | "assistant" | "crew_lead" | "crew";
const JUNIOR_ROLES: Role[] = ["assistant", "crew_lead", "crew"];

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { email, role, full_name } = (await request.json()) as { email?: string; role?: Role; full_name?: string };
  if (!email || !role) {
    return NextResponse.json({ error: "Email and role are required." }, { status: 400 });
  }

  const { data: membership } = await supabase
    .from("course_members")
    .select("course_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "No course found for this user." }, { status: 404 });
  }

  const callerRole = membership.role as Role;
  const courseId = membership.course_id as string;

  if (callerRole === "owner") {
    // any role allowed
  } else if (callerRole === "superintendent") {
    if (!JUNIOR_ROLES.includes(role)) {
      return NextResponse.json(
        { error: "Superintendents can only invite assistants, crew leads, or crew." },
        { status: 403 }
      );
    }
  } else {
    return NextResponse.json({ error: "You don't have permission to invite members." }, { status: 403 });
  }

  let adminClient;
  try {
    adminClient = createAdminClient();
  } catch (error) {
    console.error("Admin client error:", error);
    const message = error instanceof Error ? error.message : "Admin client is not configured.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const { data: existingProfile } = await adminClient
    .from("profiles")
    .select("id, email")
    .ilike("email", email)
    .maybeSingle();

  if (existingProfile) {
    const { data: existingMembership } = await supabase
      .from("course_members")
      .select("id, course_id")
      .eq("user_id", existingProfile.id)
      .maybeSingle();

    if (existingMembership?.course_id === courseId) {
      return NextResponse.json({ error: "This person is already on your team." }, { status: 409 });
    }
    if (existingMembership) {
      return NextResponse.json(
        { error: "This person already belongs to another course and can't be added to a second one." },
        { status: 409 }
      );
    }

    const { error: insertError } = await supabase.from("course_members").insert({
      course_id: courseId,
      user_id: existingProfile.id,
      role,
    });
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }
    return NextResponse.json({ mode: "added_existing" });
  }

  const origin = request.headers.get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${origin}/accept-invite`,
    data: full_name ? { full_name } : undefined,
  });

  if (inviteError || !invited?.user) {
    console.error("Invite error:", inviteError);
    return NextResponse.json({ error: inviteError?.message ?? "Failed to send invite." }, { status: 400 });
  }

  const { error: insertError } = await supabase.from("course_members").insert({
    course_id: courseId,
    user_id: invited.user.id,
    role,
  });
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  return NextResponse.json({ mode: "invited_new" });
}
