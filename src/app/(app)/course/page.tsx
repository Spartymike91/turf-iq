"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PLAN_TIERS, PLAN_DISPLAY, isPlanTier, type PlanTier } from "@/lib/billing";

export default function CoursePage() {
  return (
    <Suspense fallback={null}>
      <CourseForm />
    </Suspense>
  );
}

function CourseForm() {
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [grassType, setGrassType] = useState("Bermudagrass");
  const [climateZone, setClimateZone] = useState("warm-humid");
  const [numHoles, setNumHoles] = useState("18");
  const [acres, setAcres] = useState("");
  const [loading, setLoading] = useState(false);
  const [existingCourse, setExistingCourse] = useState<{
    id: string;
    name: string;
    city: string;
    state: string;
    grass_type: string;
    climate_zone: string;
    num_holes: number;
    maintained_acres: number;
  } | null>(null);
  const [checking, setChecking] = useState(true);
  const [tier, setTier] = useState<PlanTier | "">("");
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const t = searchParams.get("tier");
    if (isPlanTier(t)) setTier(t);
  }, [searchParams]);

  useEffect(() => {
    async function check() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: membership } = await supabase
        .from("course_members")
        .select("course_id, courses(*)")
        .eq("user_id", user.id)
        .limit(1)
        .single();

      if (membership?.courses) {
        const c = membership.courses as unknown as Record<string, unknown>;
        setExistingCourse({
          id: c.id as string,
          name: c.name as string,
          city: (c.city as string) || "",
          state: (c.state as string) || "",
          grass_type: (c.grass_type as string) || "",
          climate_zone: (c.climate_zone as string) || "",
          num_holes: (c.num_holes as number) || 18,
          maintained_acres: (c.maintained_acres as number) || 0,
        });
        setName(c.name as string);
        setCity((c.city as string) || "");
        setState((c.state as string) || "");
        setGrassType((c.grass_type as string) || "Bermudagrass");
        setClimateZone((c.climate_zone as string) || "warm-humid");
        setNumHoles(String((c.num_holes as number) || 18));
        setAcres(String((c.maintained_acres as number) || ""));
      }
      setChecking(false);
    }
    check();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    if (existingCourse) {
      const locationChanged = city !== existingCourse.city || state !== existingCourse.state;
      await supabase
        .from("courses")
        .update({
          name,
          city,
          state,
          grass_type: grassType,
          climate_zone: climateZone,
          num_holes: parseInt(numHoles),
          maintained_acres: parseFloat(acres) || null,
          ...(locationChanged ? { latitude: null, longitude: null } : {}),
        })
        .eq("id", existingCourse.id);
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
        grass_type: grassType,
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
        {existingCourse ? "Edit your course" : "Set up your course"}
      </div>
      <div className="text-[13px] text-mist mb-6">
        {existingCourse
          ? "Update your course details below."
          : "Tell us about your golf course to get started."}
      </div>

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

        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wide">
              Grass Type
            </label>
            <select
              value={grassType}
              onChange={(e) => setGrassType(e.target.value)}
              className="px-3 py-2.5 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid"
            >
              <option>Bermudagrass</option>
              <option>Bentgrass</option>
              <option>Zoysiagrass</option>
              <option>Paspalum</option>
              <option>Poa annua</option>
              <option>Mixed</option>
            </select>
          </div>
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
            onChange={(e) => setClimateZone(e.target.value)}
            className="px-3 py-2.5 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid"
          >
            <option value="warm-humid">Warm-Season Humid</option>
            <option value="warm-arid">Warm-Season Arid</option>
            <option value="cool-humid">Cool-Season Humid</option>
            <option value="cool-arid">Cool-Season Arid</option>
            <option value="transition">Transition Zone</option>
          </select>
        </div>

        {!existingCourse && (
          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-semibold uppercase tracking-wide">
              Choose Your Plan
            </label>
            <div className="grid grid-cols-3 gap-3">
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
    </div>
  );
}
