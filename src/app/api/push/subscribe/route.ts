import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveCourseIdServer } from "@/lib/supabase/course-context.server";

async function resolveOwnMembership() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;

  const context = await resolveCourseIdServer(supabase, user);
  if (!context || context.isAdminView) {
    return { error: NextResponse.json({ error: "No course found for this user." }, { status: 404 }) } as const;
  }

  const { data: membership } = await supabase
    .from("course_members")
    .select("id")
    .eq("user_id", user.id)
    .eq("course_id", context.courseId)
    .single();
  if (!membership) {
    return { error: NextResponse.json({ error: "No course found for this user." }, { status: 404 }) } as const;
  }
  return { courseId: context.courseId, courseMemberId: membership.id } as const;
}

export async function POST(request: NextRequest) {
  const resolved = await resolveOwnMembership();
  if ("error" in resolved) return resolved.error;

  const { subscription } = (await request.json()) as {
    subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  };
  const endpoint = subscription?.endpoint;
  const p256dh = subscription?.keys?.p256dh;
  const auth = subscription?.keys?.auth;
  if (!endpoint || !endpoint.startsWith("https://") || !p256dh || !auth) {
    return NextResponse.json({ error: "Invalid push subscription." }, { status: 400 });
  }

  const adminClient = createAdminClient();
  const { error } = await adminClient.from("push_subscriptions").upsert(
    {
      course_id: resolved.courseId,
      course_member_id: resolved.courseMemberId,
      endpoint,
      p256dh,
      auth,
      user_agent: request.headers.get("user-agent") ?? null,
    },
    { onConflict: "endpoint" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const resolved = await resolveOwnMembership();
  if ("error" in resolved) return resolved.error;

  const { endpoint } = (await request.json()) as { endpoint?: string };
  if (!endpoint) return NextResponse.json({ error: "endpoint is required." }, { status: 400 });

  const adminClient = createAdminClient();
  await adminClient
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
    .eq("course_member_id", resolved.courseMemberId);
  return NextResponse.json({ ok: true });
}
