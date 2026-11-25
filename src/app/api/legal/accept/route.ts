import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PRIVACY_VERSION, TERMS_VERSION, type AcceptanceSource } from "@/lib/legal";

const SOURCES: AcceptanceSource[] = ["signup", "invite", "prompt"];

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { source?: AcceptanceSource };
  if (!body.source || !SOURCES.includes(body.source)) {
    return NextResponse.json({ error: "Invalid source." }, { status: 400 });
  }

  // Everything but `source` comes from the server, never from the browser.
  const adminClient = createAdminClient();
  const [{ data: profile }, { data: memberships }] = await Promise.all([
    adminClient.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    adminClient.from("course_members").select("role, course_id, courses(name)").eq("user_id", user.id),
  ]);
  const first = memberships?.[0];
  const courseNames = (memberships ?? [])
    .map((m) => (m.courses as unknown as { name: string } | null)?.name)
    .filter(Boolean)
    .join(", ");

  // The first agreement to a version is the one that counts; repeats are ignored.
  const { error } = await adminClient.from("terms_acceptances").upsert(
    {
      user_id: user.id,
      email: user.email ?? "",
      full_name: profile?.full_name ?? (user.user_metadata?.full_name as string | undefined) ?? null,
      course_id: first?.course_id ?? null,
      course_name: courseNames || null,
      role: first?.role ?? null,
      terms_version: TERMS_VERSION,
      privacy_version: PRIVACY_VERSION,
      source: body.source,
      ip_address: request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? null,
      user_agent: request.headers.get("user-agent"),
    },
    { onConflict: "user_id,terms_version,privacy_version", ignoreDuplicates: true }
  );
  if (error) {
    console.error("terms acceptance insert error:", error);
    return NextResponse.json({ error: "Could not record your agreement." }, { status: 500 });
  }

  return NextResponse.json({ recorded: true });
}
