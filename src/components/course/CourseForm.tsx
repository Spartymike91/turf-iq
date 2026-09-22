"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { resolveCourseIdClient } from "@/lib/supabase/course-context";
import { PLAN_TIERS, PLAN_DISPLAY, isPlanTier, type PlanTier } from "@/lib/billing";
import { DEFAULT_TASK_LIBRARY } from "@/lib/defaultTaskLibrary";
import {
  GRASS_TYPES,
  GRASS_TYPE_AREAS,
  GRASS_TYPE_AREA_LABEL,
  defaultGrassTypeForClimateZone,
  resolveGrassTypes,
  type GrassTypeArea,
} from "@/lib/grassTypes";

// Shared by /course (edit whichever course is currently selected) and
// /course/new (always a blank creation form, for an owner adding an
// additional course). forceCreate skips the "do I already have a course"
// lookup entirely, since /course/new's whole purpose is to create a new one
// regardless of what else the user already owns.
export default function CourseForm({ forceCreate = false }: { forceCreate?: boolean }) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [addressError, setAddressError] = useState<string | null>(null);
  const [grassTypes, setGrassTypes] = useState<Record<GrassTypeArea, string[]>>({
    greens: [],
    tees: [],
    fairways: [],
    rough: [],
  });
  const [climateZone, setClimateZone] = useState("warm-humid");
  const [numHoles, setNumHoles] = useState("18");
  const [acres, setAcres] = useState("");
  const [loading, setLoading] = useState(false);
  const [existingCourse, setExistingCourse] = useState<{
    id: string;
    name: string;
    address: string;
    city: string;
    state: string;
    grass_type: string;
    grass_type_greens: string[];
    grass_type_tees: string[];
    grass_type_fairways: string[];
    grass_type_rough: string[];
    climate_zone: string;
    num_holes: number;
    maintained_acres: number;
    plan_tier: PlanTier | null;
    subscription_status: string | null;
    stripe_customer_id: string | null;
    billing_waived_until: string | null;
  } | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [checking, setChecking] = useState(true);
  const [tier, setTier] = useState<PlanTier | "">("");
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [resubscribeTier, setResubscribeTier] = useState<PlanTier | "">("");
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const t = searchParams.get("tier");
    if (isPlanTier(t)) setTier(t);
  }, [searchParams]);

  useEffect(() => {
    async function check() {
      if (forceCreate) {
        setChecking(false);
        return;
      }

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const context = await resolveCourseIdClient(supabase, user);
      if (!context) {
        setChecking(false);
        return;
      }

      const [{ data: course }, { data: membership }] = await Promise.all([
        supabase.from("courses").select("*").eq("id", context.courseId).single(),
        context.isAdminView
          ? Promise.resolve({ data: null })
          : supabase
              .from("course_members")
              .select("role")
              .eq("user_id", user.id)
              .eq("course_id", context.courseId)
              .maybeSingle(),
      ]);

      setIsOwner(context.isAdminView || membership?.role === "owner");

      if (course) {
        const c = course as unknown as Record<string, unknown>;
        setExistingCourse({
          id: c.id as string,
          name: c.name as string,
          address: (c.address as string) || "",
          city: (c.city as string) || "",
          state: (c.state as string) || "",
          grass_type: (c.grass_type as string) || "",
          grass_type_greens: (c.grass_type_greens as string[]) || [],
          grass_type_tees: (c.grass_type_tees as string[]) || [],
          grass_type_fairways: (c.grass_type_fairways as string[]) || [],
          grass_type_rough: (c.grass_type_rough as string[]) || [],
          climate_zone: (c.climate_zone as string) || "",
          num_holes: (c.num_holes as number) || 18,
          maintained_acres: (c.maintained_acres as number) || 0,
          plan_tier: (c.plan_tier as PlanTier) || null,
          subscription_status: (c.subscription_status as string) || null,
          stripe_customer_id: (c.stripe_customer_id as string) || null,
          billing_waived_until: (c.billing_waived_until as string) || null,
        });
        setName(c.name as string);
        setAddress((c.address as string) || "");
        setCity((c.city as string) || "");
        setState((c.state as string) || "");
        const legacy = (c.grass_type as string) || "";
        setGrassTypes({
          greens: resolveGrassTypes(c.grass_type_greens as string[], legacy),
          tees: resolveGrassTypes(c.grass_type_tees as string[], legacy),
          fairways: resolveGrassTypes(c.grass_type_fairways as string[], legacy),
          rough: resolveGrassTypes(c.grass_type_rough as string[], legacy),
        });
        setClimateZone((c.climate_zone as string) || "warm-humid");
        setNumHoles(String((c.num_holes as number) || 18));
        setAcres(String((c.maintained_acres as number) || ""));
      }
      setChecking(false);
    }
    check();
  }, [forceCreate]);

  // Geocodes and saves the street address via the same endpoint the Course
  // Map page uses (ensureCityState + isPlausibleForCityState safety checks)
  // rather than writing courses.address directly — that route is the only
  // place in the app that knows how to turn an address into a trustworthy
  // lat/lng. Returns the error message on failure, or null on success/skip.
  async function saveAddress(): Promise<string | null> {
    if (!address.trim()) return null;
    try {
      const res = await fetch("/api/course-map/set-address", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: address.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) return data?.error ?? "Could not verify that address.";
      return null;
    } catch {
      return "Could not verify that address — try again.";
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setAddressError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    if (existingCourse) {
      const locationChanged = city !== existingCourse.city || state !== existingCourse.state;
      const addressChanged = address.trim() !== existingCourse.address;
      await supabase
        .from("courses")
        .update({
          name,
          city,
          state,
          grass_type: grassTypes.greens[0] ?? null,
          grass_type_greens: grassTypes.greens.length > 0 ? grassTypes.greens : null,
          grass_type_tees: grassTypes.tees.length > 0 ? grassTypes.tees : null,
          grass_type_fairways: grassTypes.fairways.length > 0 ? grassTypes.fairways : null,
          grass_type_rough: grassTypes.rough.length > 0 ? grassTypes.rough : null,
          climate_zone: climateZone,
          num_holes: parseInt(numHoles),
          maintained_acres: parseFloat(acres) || null,
          ...(locationChanged ? { latitude: null, longitude: null } : {}),
        })
        .eq("id", existingCourse.id);

      // Re-geocode whenever the address text changed, or whenever city/state
      // changed underneath an address that's still on file (the update above
      // just nulled out lat/lng for that case) — either way the old coordinates
      // can no longer be trusted. Blocks navigation on failure so the owner
      // sees the error and can fix the address, rather than silently landing
      // on the dashboard with a course that's still geocoded wrong.
      if (addressChanged || (locationChanged && address.trim())) {
        const error = await saveAddress();
        if (error) {
          setAddressError(error);
          setLoading(false);
          return;
        }
      }
    } else {
      // Pre-generate the id and skip .select() on this insert: RETURNING re-checks
      // the courses SELECT policy, which requires a course_members row that doesn't
      // exist until the insert below, so requesting the row back here always fails.
      const courseId = crypto.randomUUID();
      const { error: courseError } = await supabase.from("courses").insert({
        id: courseId,
        name,
        city,
        state,
        grass_type: grassTypes.greens[0] ?? null,
        grass_type_greens: grassTypes.greens.length > 0 ? grassTypes.greens : null,
        grass_type_tees: grassTypes.tees.length > 0 ? grassTypes.tees : null,
        grass_type_fairways: grassTypes.fairways.length > 0 ? grassTypes.fairways : null,
        grass_type_rough: grassTypes.rough.length > 0 ? grassTypes.rough : null,
        climate_zone: climateZone,
        num_holes: parseInt(numHoles),
        maintained_acres: parseFloat(acres) || null,
      });

      if (!courseError) {
        await supabase.from("course_members").insert({
          course_id: courseId,
          user_id: user.id,
          role: "owner",
        });

        await supabase.from("task_templates").insert(
          DEFAULT_TASK_LIBRARY.map((task) => ({ ...task, course_id: courseId }))
        );

        // Makes the newly-created course "current" so the redirect below (or
        // the return trip from Stripe) lands on the course just made, not
        // whichever course happens to be oldest — essential for an owner
        // adding an additional course via /course/new; a no-op in effect for
        // a brand-new user's very first course (it's the only course either way).
        await fetch("/api/course/switch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ course_id: courseId }),
        });

        // Best-effort — don't hold up course creation on a geocoding hiccup.
        // If this fails silently, the Course Map page's own first-visit
        // "enter your address" prompt still catches it later.
        const error = await saveAddress();
        if (error) console.error("Could not geocode address at course creation:", error);

        try {
          const res = await fetch("/api/billing/checkout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tier }),
          });
          const data = await res.json();
          if (res.ok && data.url) {
            window.location.href = data.url;
            return;
          }
          console.error("Could not start checkout:", data.error);
          setCheckoutError(data.error ?? "Could not start billing. You can set this up later.");
        } catch (err) {
          console.error("Checkout request failed:", err);
        }
      }
    }

    router.push("/dashboard");
    router.refresh();
  }

  async function handleManageBilling() {
    setBillingLoading(true);
    setBillingError(null);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      setBillingError(data.error ?? "Could not open billing portal.");
    } catch {
      setBillingError("Could not open billing portal.");
    }
    setBillingLoading(false);
  }

  async function handleResubscribe() {
    if (!resubscribeTier) return;
    setBillingLoading(true);
    setBillingError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: resubscribeTier }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      setBillingError(data.error ?? "Could not start checkout.");
    } catch {
      setBillingError("Could not start checkout.");
    }
    setBillingLoading(false);
  }

  async function handleExportData() {
    setExporting(true);
    setExportError(null);
    try {
      const res = await fetch("/api/export");
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setExportError(data?.error ?? "Could not export data.");
        setExporting(false);
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="(.+)"/);
      const filename = match?.[1] ?? "turfiq-export.json";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportError("Could not export data.");
    }
    setExporting(false);
  }

  if (checking) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-mist">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto w-full">
      <div className="font-mono text-[10px] uppercase tracking-widest text-green-forest mb-1">
        {existingCourse ? "Course Profile" : "Course Setup"}
      </div>
      <div className="font-serif text-2xl text-green-dark mb-1">
        {existingCourse ? "Edit your course" : forceCreate ? "Add another course" : "Set up your course"}
      </div>
      <div className="text-[13px] text-mist mb-6">
        {existingCourse
          ? "Update your course details below."
          : "Tell us about your golf course to get started."}
      </div>

      {existingCourse && isOwner && (
        <div className="bg-white border-[1.5px] border-rule rounded-[10px] p-6 mb-4">
          <div className="font-serif text-lg text-green-dark mb-3">Billing</div>

          {existingCourse.stripe_customer_id ? (
            <div className="flex items-center justify-between">
              <div className="text-sm">
                <span className="font-semibold">
                  {existingCourse.plan_tier ? PLAN_DISPLAY[existingCourse.plan_tier].name : "Plan"}
                </span>{" "}
                <span className="text-mist">
                  · {existingCourse.subscription_status ?? "unknown status"}
                </span>
              </div>
              <button
                type="button"
                onClick={handleManageBilling}
                disabled={billingLoading}
                className="px-4 py-2 bg-green-mid text-white text-sm font-semibold rounded-lg hover:bg-green-dark transition-colors disabled:opacity-50"
              >
                {billingLoading ? "Loading..." : "Manage / Upgrade Plan"}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {existingCourse.billing_waived_until &&
                new Date(existingCourse.billing_waived_until) > new Date() && (
                  <div className="text-xs text-mist mb-1">
                    Fee waived until {new Date(existingCourse.billing_waived_until).toLocaleDateString()} — no
                    subscription needed right now, but you're welcome to subscribe anytime.
                  </div>
                )}
              <div className="text-sm text-mist mb-1">No active subscription.</div>
              <div className="flex items-center gap-3">
                <select
                  value={resubscribeTier}
                  onChange={(e) => setResubscribeTier(e.target.value as PlanTier)}
                  className="px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid"
                >
                  <option value="">Choose a plan...</option>
                  {PLAN_TIERS.map((t) => (
                    <option key={t} value={t}>
                      {PLAN_DISPLAY[t].name} — ${PLAN_DISPLAY[t].price}/mo
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleResubscribe}
                  disabled={billingLoading || !resubscribeTier}
                  className="px-4 py-2 bg-green-mid text-white text-sm font-semibold rounded-lg hover:bg-green-dark transition-colors disabled:opacity-50"
                >
                  {billingLoading ? "Loading..." : "Subscribe"}
                </button>
              </div>
            </div>
          )}
          {billingError && <div className="text-xs text-red mt-2">{billingError}</div>}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="bg-white border-[1.5px] border-rule rounded-[10px] p-6 flex flex-col gap-4"
      >
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-wide">
            Course Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="e.g. Pebble Creek Golf Club"
            className="px-3 py-2.5 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid focus:ring-2 focus:ring-green-mid/10"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-wide">
            Street Address
          </label>
          <div className="text-xs text-mist -mt-1 mb-1">
            Used to center the Course Map&apos;s satellite view precisely on your course. Optional, but
            city/state alone can only get an approximate location.
          </div>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="61 Villa Road"
            className="px-3 py-2.5 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid focus:ring-2 focus:ring-green-mid/10"
          />
          {addressError && <div className="text-xs text-red mt-1">{addressError}</div>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wide">
              City
            </label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Atlanta"
              className="px-3 py-2.5 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid focus:ring-2 focus:ring-green-mid/10"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wide">
              State
            </label>
            <input
              type="text"
              value={state}
              onChange={(e) => setState(e.target.value)}
              placeholder="GA"
              className="px-3 py-2.5 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid focus:ring-2 focus:ring-green-mid/10"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wide">
              Holes
            </label>
            <select
              value={numHoles}
              onChange={(e) => setNumHoles(e.target.value)}
              className="px-3 py-2.5 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid"
            >
              <option>9</option>
              <option>18</option>
              <option>27</option>
              <option>36</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wide">
              Maintained Acres
            </label>
            <input
              type="number"
              value={acres}
              onChange={(e) => setAcres(e.target.value)}
              placeholder="63"
              className="px-3 py-2.5 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid focus:ring-2 focus:ring-green-mid/10"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-wide">
            Climate Zone
          </label>
          <select
            value={climateZone}
            onChange={(e) => {
              const zone = e.target.value;
              setClimateZone(zone);
              // Pre-fill only areas the owner hasn't set yet — never
              // overwrite an explicit per-area choice. Transition Zone has
              // no default (defaultGrassTypeForClimateZone returns null),
              // since that's exactly the case per-area grass type exists for.
              const def = defaultGrassTypeForClimateZone(zone);
              if (!def) return;
              setGrassTypes((prev) => {
                const next = { ...prev };
                for (const area of GRASS_TYPE_AREAS) {
                  if (next[area].length === 0) next[area] = [def];
                }
                return next;
              });
            }}
            className="px-3 py-2.5 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid"
          >
            <option value="warm-humid">Warm-Season Humid</option>
            <option value="warm-arid">Warm-Season Arid</option>
            <option value="cool-humid">Cool-Season Humid</option>
            <option value="cool-arid">Cool-Season Arid</option>
            <option value="transition">Transition Zone</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-wide">Grass Type by Area</label>
          <div className="text-xs text-mist -mt-1 mb-1">
            Many courses run different grass on different areas (e.g. bentgrass greens with bermudagrass
            fairways) — disease and pest models use the right area&apos;s grass type instead of one guess for
            the whole course.
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {GRASS_TYPE_AREAS.map((area) => (
              <div key={area} className="flex flex-col gap-1.5">
                <label className="text-[10px] font-mono uppercase tracking-wide text-mist">
                  {GRASS_TYPE_AREA_LABEL[area]}
                  {grassTypes[area].length === 0 && <span className="normal-case text-mist/70"> — none selected</span>}
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {GRASS_TYPES.map((g) => {
                    const selected = grassTypes[area].includes(g);
                    return (
                      <button
                        key={g}
                        type="button"
                        onClick={() =>
                          setGrassTypes({
                            ...grassTypes,
                            [area]: selected ? grassTypes[area].filter((x) => x !== g) : [...grassTypes[area], g],
                          })
                        }
                        className={`px-2.5 py-1.5 border-[1.5px] rounded-lg text-xs font-medium transition-colors ${
                          selected ? "border-green-bright bg-green-pale text-green-dark" : "border-rule text-mist hover:border-green-mid"
                        }`}
                      >
                        {g}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {!existingCourse && (
          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-semibold uppercase tracking-wide">
              Choose Your Plan
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {PLAN_TIERS.map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => setTier(t)}
                  className={`text-left px-3 py-3 border-[1.5px] rounded-lg text-sm transition-all ${
                    tier === t ? "border-green-bright bg-green-pale" : "border-rule hover:border-green-mid"
                  }`}
                >
                  <div className="font-semibold">{PLAN_DISPLAY[t].name}</div>
                  <div className="text-mist text-xs">${PLAN_DISPLAY[t].price}/mo</div>
                </button>
              ))}
            </div>
            <span className="text-xs text-mist">14-day free trial, then billed monthly. Cancel anytime.</span>
          </div>
        )}

        {checkoutError && (
          <div className="bg-red/5 border-[1.5px] border-red/40 rounded-lg px-3 py-2 text-xs text-red">
            {checkoutError}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !name || (!existingCourse && !tier)}
          className="mt-2 px-4 py-3 bg-green-mid text-white font-semibold rounded-lg hover:bg-green-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading
            ? "Saving..."
            : existingCourse
            ? "Save Changes"
            : "Create Course & Get Started →"}
        </button>
      </form>

      {existingCourse && (
        <div className="bg-white border-[1.5px] border-rule rounded-[10px] p-6 mt-4">
          <div className="font-serif text-lg text-green-dark mb-3">Data &amp; Privacy</div>
          <div className="flex items-center justify-between">
            <div className="text-sm text-mist max-w-sm">
              Download a full export of your course&apos;s data — profile, team, tasks, expenses,
              equipment, applications, and reports.
            </div>
            <button
              type="button"
              onClick={handleExportData}
              disabled={exporting}
              className="px-4 py-2 bg-green-mid text-white text-sm font-semibold rounded-lg hover:bg-green-dark transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {exporting ? "Exporting..." : "Export My Data"}
            </button>
          </div>
          {exportError && <div className="text-xs text-red mt-2">{exportError}</div>}
          <div className="text-xs text-mist mt-4 pt-3 border-t border-rule">
            See our{" "}
            <Link href="/terms" target="_blank" className="text-green-mid font-semibold hover:underline">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" target="_blank" className="text-green-mid font-semibold hover:underline">
              Privacy Policy
            </Link>
            . Curious how the predictions on your dashboard are calculated?{" "}
            <Link href="/how-it-works" target="_blank" className="text-green-mid font-semibold hover:underline">
              See how we calculate this
            </Link>
            .
          </div>
        </div>
      )}
    </div>
  );
}
