import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveCourseIdServer } from "@/lib/supabase/course-context.server";

// Nominatim (OpenStreetMap's free geocoder) asks callers to identify
// themselves with a real User-Agent and to stay under 1 request/second —
// trivially satisfied here since this only fires when a manager sets or
// changes the course's address, not per note/pin.
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "TurfIQ/1.0 (https://turfiq.club; contact: mikeconley7@gmail.com)";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const context = await resolveCourseIdServer(supabase, user);
  if (!context) {
    return NextResponse.json({ error: "No course found for this user." }, { status: 404 });
  }
  const courseId = context.courseId;

  if (!context.isAdminView) {
    const { data: membership } = await supabase
      .from("course_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("course_id", courseId)
      .single();
    if (!membership || (membership.role !== "owner" && membership.role !== "superintendent")) {
      return NextResponse.json({ error: "Only owners and superintendents can set the course address." }, { status: 403 });
    }
  }

  const { address } = (await request.json()) as { address?: string };
  if (!address || !address.trim()) {
    return NextResponse.json({ error: "address is required." }, { status: 400 });
  }

  const geoRes = await fetch(`${NOMINATIM_URL}?format=json&limit=1&q=${encodeURIComponent(address)}`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!geoRes.ok) {
    return NextResponse.json({ error: "Geocoding service unavailable — try again shortly." }, { status: 502 });
  }
  const results = (await geoRes.json()) as Array<{ lat: string; lon: string }>;
  const match = results[0];
  if (!match) {
    return NextResponse.json({ error: "Couldn't find that address — try adding city and state." }, { status: 422 });
  }

  const adminClient = createAdminClient();
  const { data: updated, error: updateError } = await adminClient
    .from("courses")
    .update({ address: address.trim(), latitude: Number(match.lat), longitude: Number(match.lon) })
    .eq("id", courseId)
    .select("address, latitude, longitude")
    .single();
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ course: updated });
}
