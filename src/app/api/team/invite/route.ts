import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveCourseIdServer } from "@/lib/supabase/course-context.server";
import { sendEmail, inviteEmailHtml } from "@/lib/email";

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

  const { email, role, full_name, allowed_modules } = (await request.json()) as {
    email?: string;
    role?: Role;
    full_name?: string;
    allowed_modules?: string[] | null;
  };
  if (!email || !role) {
    return NextResponse.json({ error: "Email and role are required." }, { status: 400 });
  }
  // Owners/superintendents are always unrestricted, regardless of what a
  // crafted request sends — the checklist only ever applies to junior roles.
  const resolvedAllowedModules = JUNIOR_ROLES.includes(role) ? allowed_modules ?? null : null;

  const context = await resolveCourseIdServer(supabase);
  if (!context) {
    return NextResponse.json({ error: "No course found for this user." }, { status: 404 });
  }
  const courseId = context.courseId;

  // Admin-view acts as owner-equivalent — full invite permissions, since the
  // admin isn't a course_members row and has no role of their own to check.
  let callerRole: Role;
  if (context.isAdminView) {
    callerRole = "owner";
  } else {
    const { data: membership } = await supabase
      .from("course_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("course_id", courseId)
      .single();
    if (!membership) {
      return NextResponse.json({ error: "No course found for this user." }, { status: 404 });
    }
    callerRole = membership.role as Role;
  }

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
      allowed_modules: resolvedAllowedModules,
    });
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }
    return NextResponse.json({ mode: "added_existing" });
  }

  const origin = request.headers.get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";
  // Supabase's own SMTP dispatch to Resend was confirmed broken (generateLink
  // creates the user + link without emailing anything; a direct Resend API
  // call with the same credentials succeeds instantly — so the failure is
  // specifically in Supabase's SMTP relay, not the credentials or domain).
  // Sending the email ourselves via Resend's API sidesteps it entirely.
  const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
    type: "invite",
    email,
    options: {
      redirectTo: `${origin}/accept-invite`,
      data: full_name ? { full_name } : undefined,
    },
  });

  if (linkError || !linkData?.user) {
    console.error("Invite link error:", linkError);
    return NextResponse.json({ error: linkError?.message ?? "Failed to create invite." }, { status: 400 });
  }

  const { data: course } = await supabase.from("courses").select("name").eq("id", courseId).single();

  try {
    await sendEmail({
      to: email,
      subject: `You're invited to join ${course?.name ?? "your course"} on TurfIQ`,
      html: inviteEmailHtml({
        courseName: course?.name ?? "your course",
        role,
        actionLink: linkData.properties.action_link,
      }),
    });
  } catch (error) {
    console.error("Invite email send failed:", error);
    // The user + invite link were created successfully even if the email
    // failed to send — don't silently strand them without a way to know,
    // but also don't roll back the invite since it's still valid/usable.
    return NextResponse.json(
      { error: "Invite created, but the email failed to send. Please try again or contact support." },
      { status: 502 }
    );
  }

  const { error: insertError } = await supabase.from("course_members").insert({
    course_id: courseId,
    user_id: linkData.user.id,
    role,
    allowed_modules: resolvedAllowedModules,
  });
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  return NextResponse.json({ mode: "invited_new" });
}
