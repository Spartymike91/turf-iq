import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlatformAdminSession } from "@/lib/supabase/platform-admin";

const ELEVATION_MINUTES = 30;

export async function POST(request: NextRequest) {
  const { user, isPlatformAdmin } = await getPlatformAdminSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isPlatformAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { pin } = (await request.json()) as { pin?: string };
  if (!pin) return NextResponse.json({ error: "PIN is required." }, { status: 400 });

  const supabase = await createClient();
  const { data: valid, error } = await supabase.rpc("verify_admin_pin", { input_pin: pin });
  if (error) {
    console.error("verify_admin_pin error:", error);
    return NextResponse.json({ error: "Could not verify PIN." }, { status: 500 });
  }
  if (!valid) {
    return NextResponse.json({ error: "Incorrect PIN." }, { status: 401 });
  }

  const expiresAt = new Date(Date.now() + ELEVATION_MINUTES * 60 * 1000).toISOString();
  const adminClient = createAdminClient();
  const { error: upsertError } = await adminClient
    .from("admin_edit_sessions")
    .upsert({ user_id: user.id, expires_at: expiresAt });

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  return NextResponse.json({ elevated: true, expiresAt });
}

export async function DELETE() {
  const { user, isPlatformAdmin } = await getPlatformAdminSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isPlatformAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const adminClient = createAdminClient();
  await adminClient.from("admin_edit_sessions").delete().eq("user_id", user.id);

  return NextResponse.json({ elevated: false });
}
