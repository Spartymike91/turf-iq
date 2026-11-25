import { NextRequest, NextResponse } from "next/server";
import { getPlatformAdminSession } from "@/lib/supabase/platform-admin";
import { createAdminClient } from "@/lib/supabase/admin";

const PAGE_SIZE = 1000;

const COLUMNS = [
  "accepted_at",
  "full_name",
  "email",
  "course_name",
  "course_now",
  "role",
  "terms_version",
  "privacy_version",
  "source",
  "ip_address",
  "user_agent",
  "user_id",
] as const;

function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  // Names and browser strings are user-supplied: stop Excel running them as formulas.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: NextRequest) {
  const { user, isPlatformAdmin } = await getPlatformAdminSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isPlatformAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const adminClient = createAdminClient();
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await adminClient
      .from("terms_acceptances")
      .select("*")
      .order("accepted_at", { ascending: false })
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }

  // New owners agree before their course exists, so also show where they are now.
  const { data: memberships } = await adminClient.from("course_members").select("user_id, courses(name)");
  const coursesNow = new Map<string, string[]>();
  for (const m of memberships ?? []) {
    const name = (m.courses as unknown as { name: string } | null)?.name;
    if (name) coursesNow.set(m.user_id, [...(coursesNow.get(m.user_id) ?? []), name]);
  }
  const acceptances: Record<string, unknown>[] = rows.map((r) => ({
    ...r,
    course_now: coursesNow.get(r.user_id as string)?.join(", ") ?? "",
  }));

  if (request.nextUrl.searchParams.get("format") === "csv") {
    const csv = [COLUMNS.join(","), ...acceptances.map((r) => COLUMNS.map((c) => csvCell(r[c])).join(","))].join("\r\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="turfiq-terms-acceptances-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return NextResponse.json({ acceptances });
}
