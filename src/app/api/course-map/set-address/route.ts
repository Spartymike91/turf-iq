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

// A bare street address with no city/state ("61 Villa Rd") gives Nominatim
// nothing to disambiguate with — confirmed live on 2026-09-22, where
// exactly that string matched an unrelated "Villa Road" in Birmingham,
// England instead of Greenville, SC, and sat there undetected until the
// map visibly showed the wrong continent. The course's own city/state are
// already on file from initial setup, so append them whenever the address
// doesn't already seem to mention the city — cheap insurance against ever
// sending an under-specified query to the geocoder again.
function ensureCityState(address: string, city: string | null, state: string | null): string {
  if (!city && !state) return address;
  const lower = address.toLowerCase();
  if (city && lower.includes(city.toLowerCase())) return address;
  return `${address}, ${[city, state].filter(Boolean).join(", ")}`;
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

function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8; // Earth radius, miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Second line of defense beyond ensureCityState — even a well-formed
// address can still resolve somewhere implausible (a typo, an ambiguous
// street name, a geocoder quirk). Cross-checks the precise match against a
// fresh geocode of just the course's city/state and rejects anything
// wildly far from it, rather than trusting whatever the geocoder returns.
// Generous threshold (75mi) to allow for legitimately rural courses
// outside a small town's exact center, while still catching "wrong side of
// the planet" mistakes like the Birmingham, England one this is named for.
const MAX_PLAUSIBLE_MILES_FROM_CITY = 75;

async function isPlausibleForCityState(
  match: { lat: string; lon: string },
  city: string | null,
  state: string | null
): Promise<boolean> {
  if (!city && !state) return true; // nothing on file to check against
  await new Promise((resolve) => setTimeout(resolve, 1000)); // stay under Nominatim's 1 req/sec
  const cityMatch = await nominatimSearch([city, state].filter(Boolean).join(", "));
  if (!cityMatch) return true; // reference geocode itself failed — don't block on that
  const miles = haversineMiles(Number(match.lat), Number(match.lon), Number(cityMatch.lat), Number(cityMatch.lon));
  return miles <= MAX_PLAUSIBLE_MILES_FROM_CITY;
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

  const { address: rawAddress } = (await request.json()) as { address?: string };
  if (!rawAddress || !rawAddress.trim()) {
    return NextResponse.json({ error: "address is required." }, { status: 400 });
  }

  const { data: courseRow } = await supabase.from("courses").select("city, state").eq("id", courseId).single();
  const address = ensureCityState(rawAddress.trim(), courseRow?.city ?? null, courseRow?.state ?? null);

  let match: { lat: string; lon: string } | null;
  try {
    match = await geocodeAddress(address);
  } catch {
    return NextResponse.json({ error: "Geocoding service unavailable — try again shortly." }, { status: 502 });
  }
  if (!match) {
    return NextResponse.json({ error: "Couldn't find that address — try adding city and state." }, { status: 422 });
  }

  let plausible: boolean;
  try {
    plausible = await isPlausibleForCityState(match, courseRow?.city ?? null, courseRow?.state ?? null);
  } catch {
    plausible = true; // sanity-check call itself failing shouldn't block a legitimate address
  }
  if (!plausible) {
    return NextResponse.json(
      {
        error: `That address matched a location far from ${[courseRow?.city, courseRow?.state].filter(Boolean).join(", ") || "your course's city/state"} — double-check it and try again.`,
      },
      { status: 422 }
    );
  }

  // Stores the enriched address (with city/state appended, if it was) rather
  // than the raw input — otherwise a course could end up displaying just
  // "61 Villa Rd" with no indication that's actually Greenville, SC, even
  // though that's exactly what got geocoded.
  const adminClient = createAdminClient();
  const { data: updated, error: updateError } = await adminClient
    .from("courses")
    .update({ address, latitude: Number(match.lat), longitude: Number(match.lon) })
    .eq("id", courseId)
    .select("address, latitude, longitude")
    .single();
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ course: updated });
}
