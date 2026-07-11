import { NextRequest, NextResponse } from "next/server";
import { getPlatformAdminSession } from "@/lib/supabase/platform-admin";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, isPlatformAdmin } = await getPlatformAdminSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isPlatformAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const { months } = (await request.json()) as { months?: number };
  if (!months || !Number.isInteger(months) || months < 1 || months > 12) {
    return NextResponse.json({ error: "months must be an integer between 1 and 12." }, { status: 400 });
  }

  const adminClient = createAdminClient();
  const { data: course } = await adminClient.from("courses").select("id").eq("id", id).maybeSingle();
  if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 });

  const waivedUntil = new Date();
  waivedUntil.setMonth(waivedUntil.getMonth() + months);

  const { error } = await adminClient
    .from("courses")
    .update({
      billing_waived_until: waivedUntil.toISOString(),
      billing_waived_by: user.id,
      billing_waived_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ billing_waived_until: waivedUntil.toISOString() });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, isPlatformAdmin } = await getPlatformAdminSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isPlatformAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const adminClient = createAdminClient();

  // Deliberately only clears billing_waived_until, not billing_waived_by/at —
  // those stay as a record of who granted the most recent waiver and when.
  const { error } = await adminClient.from("courses").update({ billing_waived_until: null }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cleared: true });
}
