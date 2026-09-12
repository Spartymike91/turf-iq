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

async function nominatimSearch(q: string): Promise<{ lat: string; lon: string } | null> {
  const res = await fetch(`${NOMINATIM_URL}?format=json&limit=1&q=${encodeURIComponent(q)}`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) return null;
  const results = (await res.json()) as Array<{ lat: string; lon: string }>;
  return results[0] ?? null;
}

// Nominatim's US coverage frequently has the "mailing city" (what USPS puts
// on the ZIP, and what everyone actually types) diverge from the locality
// OSM's place hierarchy has the street tagged under — common for
// unincorporated communities that share a nearby city's ZIP code. When that
// happens the full "street, city, state zip" string returns zero matches
// even though the street resolves fine on its own. Retrying with just the
// first (street) and last (state/zip) comma-separated segments — dropping
// whatever's in between — reliably works around it, verified against a
// real address that hit exactly this case (Bucknell Drive, Knoxville TN,
// actually tagged under "Halls Crossroads" in OSM).
async function geocodeAddress(address: string): Promise<{ lat: string; lon: string } | null> {
  const direct = await nominatimSearch(address);
  if (direct) return direct;

  const segments = address.split(",").map((s) => s.trim()).filter(Boolean);
  if (segments.length < 3) return null;

  await new Promise((resolve) => setTimeout(resolve, 1000)); // stay under Nominatim's 1 req/sec
  return nominatimSearch(`${segments[0]}, ${segments[segments.length - 1]}`);
}

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

  let match: { lat: string; lon: string } | null;
  try {
    match = await geocodeAddress(address);
  } catch {
    return NextResponse.json({ error: "Geocoding service unavailable — try again shortly." }, { status: 502 });
  }
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
