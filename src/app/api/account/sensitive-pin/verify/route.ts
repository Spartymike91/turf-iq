import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const ELEVATION_MINUTES = 30;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { pin } = (await request.json()) as { pin?: string };
  if (!pin) return NextResponse.json({ error: "PIN is required." }, { status: 400 });

  const { data: valid, error } = await supabase.rpc("verify_sensitive_pin", { input_pin: pin });
  if (error) {
    console.error("verify_sensitive_pin error:", error);
    return NextResponse.json({ error: "Could not verify PIN." }, { status: 500 });
  }
  if (!valid) {
    return NextResponse.json({ error: "Incorrect PIN." }, { status: 401 });
  }

  const expiresAt = new Date(Date.now() + ELEVATION_MINUTES * 60 * 1000).toISOString();
  const adminClient = createAdminClient();
  const { error: upsertError } = await adminClient
    .from("sensitive_data_sessions")
    .upsert({ user_id: user.id, expires_at: expiresAt });

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  return NextResponse.json({ elevated: true, expiresAt });
}

export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const adminClient = createAdminClient();
  await adminClient.from("sensitive_data_sessions").delete().eq("user_id", user.id);

  return NextResponse.json({ elevated: false });
}
