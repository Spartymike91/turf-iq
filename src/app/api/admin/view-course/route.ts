import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getPlatformAdminSession } from "@/lib/supabase/platform-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { ADMIN_VIEW_COOKIE } from "@/lib/supabase/course-context";

export async function POST(request: NextRequest) {
  const { user, isPlatformAdmin } = await getPlatformAdminSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isPlatformAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { course_id } = (await request.json()) as { course_id?: string };
  if (!course_id) {
    return NextResponse.json({ error: "course_id is required." }, { status: 400 });
  }

  const adminClient = createAdminClient();
  const { data: course } = await adminClient
    .from("courses")
    .select("id")
    .eq("id", course_id)
    .maybeSingle();
  if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 });

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_VIEW_COOKIE, course_id, {
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 8, // 8h safety expiry in case "Exit admin view" is never clicked
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const { user, isPlatformAdmin } = await getPlatformAdminSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isPlatformAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_VIEW_COOKIE);

  return NextResponse.json({ ok: true });
}
