"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { resolveCourseIdClient } from "@/lib/supabase/course-context";
import type { WeatherResult } from "@/lib/weather";
import { isDiseaseTarget } from "@/lib/pestCategorization";
import { isCoolSeasonGrass, isSpringDeadSpotHost } from "@/lib/pestModels";
import { printSection } from "@/lib/printSection";
import PestApplicationEditRow, { type PestApplicationRow } from "@/components/turf-health/PestApplicationEditRow";

interface Product {
  id: string;
  name: string;
  category: string;
  unit: string;
  unit_cost: number | null;
  current_stock: number;
}

export default function DiseaseRiskSection() {
  const [courseName, setCourseName] = useState("");
  const [grassType, setGrassType] = useState("");
  const [weather, setWeather] = useState<WeatherResult | null>(null);
  const [nAppliedYtd, setNAppliedYtd] = useState<number | null>(null);
  const [nTarget, setNTarget] = useState<number | null>(null);
  const [lastNAppDate, setLastNAppDate] = useState<string | null>(null);
  const [latestSoilTest, setLatestSoilTest] = useState<{ ph: number | null; potassium_ppm: number | null } | null>(null);
  const [sprays, setSprays] = useState<PestApplicationRow[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const context = await resolveCourseIdClient(supabase);
      if (!context) return;

      const { data: course } = await supabase
        .from("courses")
        .select("name, grass_type")
        .eq("id", context.courseId)
        .single();

      setCourseName(course?.name ?? "");
      setGrassType(course?.grass_type ?? "");

      const fiscalYear = new Date().getFullYear();
      const [{ data: program }, { data: apps }, { data: sprayRows }, { data: prods }, { data: soilTest }] = await Promise.all([
        supabase
          .from("fertility_programs")
          .select("annual_n_target")
          .eq("course_id", context.courseId)
          .eq("fiscal_year", fiscalYear)
          .maybeSingle(),
        supabase
          .from("fertilizer_applications")
          .select("n_lbs_per_1000, application_date")
          .eq("course_id", context.courseId)
          .gte("application_date", `${fiscalYear}-01-01`),
        supabase
          .from("pest_applications")
          .select("*")
          .eq("course_id", context.courseId)
          .order("applied_at", { ascending: false }),
        // Unrestricted (any category) — no add-form picker here anymore,
        // this is only used to classify legacy rows (category IS NULL) by
        // their linked product's own category.
        supabase
          .from("products")
          .select("id, name, category, unit, unit_cost, current_stock")
          .eq("course_id", context.courseId)
          .eq("is_active", true)
          .order("name"),
        supabase
          .from("soil_tests")
          .select("ph, potassium_ppm")
          .eq("course_id", context.courseId)
          .order("test_date", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      setNTarget(program ? Number(program.annual_n_target) : null);
      setNAppliedYtd((apps ?? []).reduce((sum, a) => sum + Number(a.n_lbs_per_1000), 0));
      setLastNAppDate(
        (apps ?? []).reduce((latest: string | null, a) => (!latest || a.application_date > latest ? a.application_date : latest), null)
      );
      setSprays((sprayRows ?? []).filter((s) => s.category === "fungicide" || (s.category == null && isDiseaseTarget(s.target))));
      setProducts(prods ?? []);
      setLatestSoilTest(soilTest ?? null);

      try {
        const res = await fetch("/api/weather");
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Unable to load weather data.");
        } else {
          setWeather(data);
        }
      } catch {
        setError("Unable to load weather data.");
      }
      setLoading(false);
    }
    load();
  }, []);

  const daysSinceLastSpray = useMemo(() => {
    if (sprays.length === 0) return null;
    const lastMs = new Date(sprays[0].applied_at).getTime();
    return Math.floor((now - lastMs) / 86400000);
  }, [sprays, now]);

  async function handleDeleteSpray(id: string) {
    const supabase = createClient();
    const { error: deleteError } = await supabase.from("pest_applications").delete().eq("id", id);
    if (!deleteError) setSprays((prev) => prev.filter((s) => s.id !== id));
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-mist">Loading disease risk models...</div>
      </div>
    );
  }

  if (error || !weather) {
    return (
      <div className="bg-white border-[1.5px] border-rule rounded-[10px] p-6 text-center">
        <div className="font-serif text-xl text-green-dark mb-2">Disease risk unavailable</div>
        <div className="text-sm text-mist max-w-md mx-auto">{error}</div>
      </div>
    );
  }

  const { dollarSpot, pythium, brownPatch, anthracnose, fusariumPatch, springDeadSpot } = weather.diseaseRisk;
  const dsAboveThreshold = dollarSpot.probabilityPct >= dollarSpot.actionThresholdPct;
  const showCoolSeasonDiseases = isCoolSeasonGrass(grassType);
  const showSpringDeadSpot = isSpringDeadSpotHost(grassType);

  // Fall N applied while soil temp is in the SDS infection window — a
  // documented risk factor (delays dormancy, reduces cold hardiness), not a
  // hard rule. "Fall" here just means "an N application logged within the
  // last 90 days while inFallWindow is true," since the app has no separate
  // concept of calendar season.
  const fallNRisk =
    springDeadSpot.inFallWindow &&
    lastNAppDate != null &&
    now - new Date(lastNAppDate).getTime() < 90 * 24 * 60 * 60 * 1000;
  const soilPhRisk = latestSoilTest?.ph != null && latestSoilTest.ph > 7.0;
  const soilKRisk = latestSoilTest?.potassium_ppm != null && latestSoilTest.potassium_ppm < 100;
  const sdsRiskFactorCount = [fallNRisk, soilPhRisk, soilKRisk].filter(Boolean).length;

  const updated = new Date(weather.updatedAt);
  const circumference = 2 * Math.PI * 36;
  const dashOffset = circumference * (1 - Math.min(dollarSpot.probabilityPct, 100) / 100);

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-green-forest mb-1">
            Disease Risk Monitor
          </div>
          <div className="font-serif text-2xl text-green-dark">Turfgrass Disease Prediction</div>
          <div className="text-[13px] text-mist mt-1">
            {courseName} {grassType && `· ${grassType}`} ·{" "}
            <span className="inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-green-bright rounded-full animate-pulse-dot inline-block" />
              Models updated{" "}
              {updated.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </span>
          </div>
        </div>
      </div>

      {!dollarSpot.inValidRange && (
        <div className="bg-blue/5 border-[1.5px] border-blue/40 rounded-[7px] px-4 py-3 text-[11px] text-mist">
          5-day mean temperature ({dollarSpot.meanTempF}°F) is outside the Dollar Spot model&apos;s
          validated 10–35°C (50–95°F) range — the probability below may not be meaningful right now.
        </div>
      )}

      {/* Disease Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white border-[1.5px] border-green-mid bg-green-pale rounded-lg p-3.5 text-center">
          <div className="flex items-center justify-center gap-1.5 mb-1.5">
            <span className="text-[11px] font-semibold text-ink">Dollar Spot</span>
            <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-green-mid text-white font-mono">
              MODEL
            </span>
          </div>
          <div
            className={`font-mono text-xl font-semibold leading-none mb-1.5 ${
              dsAboveThreshold ? "text-red" : "text-green-mid"
            }`}
          >
            {dollarSpot.probabilityPct.toFixed(1)}%
          </div>
          <span
            className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded font-mono ${
              dsAboveThreshold ? "bg-red/10 text-red" : "bg-green-pale text-green-mid"
            }`}
          >
            {dsAboveThreshold ? "ABOVE THRESHOLD" : "BELOW THRESHOLD"}
          </span>
          <div className="flex items-center justify-center gap-1 mt-2">
            {dollarSpot.forecast.map((f) => {
              const above = f.probabilityPct >= dollarSpot.actionThresholdPct;
              return (
                <span
                  key={f.hoursAhead}
                  title={`${f.probabilityPct.toFixed(1)}% projected in ${f.hoursAhead}h`}
                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded font-mono ${
                    above ? "bg-red/10 text-red" : "bg-green-pale text-green-mid"
                  }`}
                >
                  +{f.hoursAhead}h
                </span>
              );
            })}
          </div>
        </div>

        <div className="bg-white border-[1.5px] border-rule rounded-lg p-3.5 text-center">
          <div className="flex items-center justify-center gap-1.5 mb-1.5">
            <span className="text-[11px] font-semibold text-ink">Pythium Blight</span>
            <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-amber text-white font-mono">
              HEURISTIC
            </span>
          </div>
          <div
            className={`font-mono text-xl font-semibold leading-none mb-1.5 ${
              pythium.elevated ? "text-red" : "text-green-mid"
            }`}
          >
            {pythium.hoursRhAbove90}
            <span className="text-xs font-normal text-mist">hrs</span>
          </div>
          <span
            className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded font-mono ${
              pythium.elevated ? "bg-red/10 text-red" : "bg-green-pale text-green-mid"
            }`}
          >
            {pythium.elevated ? "CONDITIONS MET" : "NOT ELEVATED"}
          </span>
          <div className="flex items-center justify-center gap-1 mt-2">
            {pythium.forecast.map((f) => (
              <span
                key={f.hoursAhead}
                title={`${f.elevated ? "Conditions met" : "Not elevated"} in ${f.hoursAhead}h`}
                className={`text-[9px] font-bold px-1.5 py-0.5 rounded font-mono ${
                  f.elevated ? "bg-red/10 text-red" : "bg-green-pale text-green-mid"
                }`}
              >
                +{f.hoursAhead}h
              </span>
            ))}
          </div>
        </div>

        <div className="bg-white border-[1.5px] border-rule rounded-lg p-3.5 text-center">
          <div className="flex items-center justify-center gap-1.5 mb-1.5">
            <span className="text-[11px] font-semibold text-ink">Brown Patch</span>
            <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-amber text-white font-mono">
              HEURISTIC
            </span>
          </div>
          <div
            className={`font-mono text-xl font-semibold leading-none mb-1.5 ${
              brownPatch.elevated ? "text-red" : "text-green-mid"
            }`}
          >
            {brownPatch.hoursRhAbove95}
            <span className="text-xs font-normal text-mist">hrs</span>
          </div>
          <span
            className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded font-mono ${
              brownPatch.elevated ? "bg-red/10 text-red" : "bg-green-pale text-green-mid"
            }`}
          >
            {brownPatch.elevated ? "CONDITIONS MET" : "NOT ELEVATED"}
          </span>
          <div className="flex items-center justify-center gap-1 mt-2">
            {brownPatch.forecast.map((f) => (
              <span
                key={f.hoursAhead}
                title={`${f.elevated ? "Conditions met" : "Not elevated"} in ${f.hoursAhead}h`}
                className={`text-[9px] font-bold px-1.5 py-0.5 rounded font-mono ${
                  f.elevated ? "bg-red/10 text-red" : "bg-green-pale text-green-mid"
                }`}
              >
                +{f.hoursAhead}h
              </span>
            ))}
          </div>
        </div>

        {showCoolSeasonDiseases && (
          <div className="bg-white border-[1.5px] border-rule rounded-lg p-3.5 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1.5">
              <span className="text-[11px] font-semibold text-ink">Anthracnose</span>
              <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-green-mid text-white font-mono">
                MODEL
              </span>
            </div>
            <div
              className={`font-mono text-xl font-semibold leading-none mb-1.5 ${
                anthracnose.elevated ? "text-red" : "text-green-mid"
              }`}
            >
              {anthracnose.asi.toFixed(1)}
              <span className="text-xs font-normal text-mist"> ASI</span>
            </div>
            <span
              className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded font-mono ${
                anthracnose.elevated ? "bg-red/10 text-red" : "bg-green-pale text-green-mid"
              }`}
            >
              {anthracnose.elevated ? "ABOVE THRESHOLD" : "BELOW THRESHOLD"}
            </span>
            <div className="flex items-center justify-center gap-1 mt-2">
              {anthracnose.forecast.map((f) => (
                <span
                  key={f.hoursAhead}
                  title={`ASI ${f.asi.toFixed(1)} projected in ${f.hoursAhead}h`}
                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded font-mono ${
                    f.elevated ? "bg-red/10 text-red" : "bg-green-pale text-green-mid"
                  }`}
                >
                  +{f.hoursAhead}h
                </span>
              ))}
            </div>
          </div>
        )}

        {showCoolSeasonDiseases && (
          <div className="bg-white border-[1.5px] border-rule rounded-lg p-3.5 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1.5">
              <span className="text-[11px] font-semibold text-ink">Fusarium Patch</span>
              <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-amber text-white font-mono">
                HEURISTIC
              </span>
            </div>
            <div
              className={`font-mono text-xl font-semibold leading-none mb-1.5 ${
                fusariumPatch.elevated ? "text-red" : "text-green-mid"
              }`}
            >
              {fusariumPatch.wetHours}
              <span className="text-xs font-normal text-mist">hrs</span>
            </div>
            <span
              className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded font-mono ${
                fusariumPatch.elevated ? "bg-red/10 text-red" : "bg-green-pale text-green-mid"
              }`}
            >
              {fusariumPatch.elevated ? "CONDITIONS MET" : "NOT ELEVATED"}
            </span>
            <div className="flex items-center justify-center gap-1 mt-2">
              {fusariumPatch.forecast.map((f) => (
                <span
                  key={f.hoursAhead}
                  title={`${f.elevated ? "Conditions met" : "Not elevated"} in ${f.hoursAhead}h`}
                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded font-mono ${
                    f.elevated ? "bg-red/10 text-red" : "bg-green-pale text-green-mid"
                  }`}
                >
                  +{f.hoursAhead}h
                </span>
              ))}
            </div>
          </div>
        )}

        {showSpringDeadSpot && (
          <div className="bg-white border-[1.5px] border-rule rounded-lg p-3.5 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1.5">
              <span className="text-[11px] font-semibold text-ink">Spring Dead Spot</span>
              <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-amber text-white font-mono">
                RISK FACTORS
              </span>
            </div>
            <div
              className={`font-mono text-xl font-semibold leading-none mb-1.5 ${
                springDeadSpot.inFallWindow ? "text-red" : "text-green-mid"
              }`}
            >
              {springDeadSpot.soilTempF != null ? springDeadSpot.soilTempF.toFixed(0) : "—"}
              <span className="text-xs font-normal text-mist">°F soil</span>
            </div>
            <span
              className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded font-mono ${
                springDeadSpot.inFallWindow ? "bg-red/10 text-red" : "bg-green-pale text-green-mid"
              }`}
            >
              {springDeadSpot.inFallWindow ? "IN FALL WINDOW" : "OUT OF WINDOW"}
            </span>
            {springDeadSpot.inFallWindow && (
              <div className="mt-2 text-[9px] text-mist">
                {sdsRiskFactorCount} risk factor{sdsRiskFactorCount === 1 ? "" : "s"} flagged below
              </div>
            )}
          </div>
        )}
      </div>

      {/* Dollar Spot Detail Card */}
      <div className="bg-white border-[1.5px] border-rule rounded-[10px] overflow-hidden shrink-0">
        <div className="bg-green-dark p-5 grid grid-cols-[1fr_auto] gap-4 items-center">
          <div>
            <div className="font-serif text-xl text-white mb-1">Dollar Spot</div>
            <div className="text-[11px] text-white/50 italic mb-2.5">
              Clarireedia jacksonii · Clarireedia monteithiana
            </div>
            <div className="text-[10px] text-white/40 font-mono">
              Smith, Kerns &amp; Koch (2018) logistic model · course-level weather station
            </div>
          </div>
          <div className="text-center">
            <div className="relative w-[90px] h-[90px]">
              <svg viewBox="0 0 90 90" width="90" height="90" style={{ transform: "rotate(-90deg)" }}>
                <circle cx="45" cy="45" r="36" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="8" />
                <circle
                  cx="45"
                  cy="45"
                  r="36"
                  fill="none"
                  stroke={dsAboveThreshold ? "#dc2626" : "#52b788"}
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={circumference.toFixed(1)}
                  strokeDashoffset={dashOffset.toFixed(1)}
                />
              </svg>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
                <div className="font-mono text-xl font-bold text-white leading-none">
                  {dollarSpot.probabilityPct.toFixed(0)}%
                </div>
                <div className="text-[9px] text-white/45 uppercase tracking-wide mt-0.5">Probability</div>
              </div>
            </div>
            <div className={`text-[10px] font-bold mt-1 font-mono ${dsAboveThreshold ? "text-red" : "text-green-bright"}`}>
              ● {dsAboveThreshold ? "ABOVE" : "BELOW"} 20% THRESHOLD
            </div>
          </div>
        </div>
        <div className="p-5 grid grid-cols-2 gap-5">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-mist font-mono mb-2.5">
              Model Inputs (5-day trailing average)
            </div>
            {[
              { name: "Mean Air Temp", val: `${dollarSpot.meanTempF}°F`, flag: dollarSpot.inValidRange ? "OK" : "OUT OF RANGE", ok: dollarSpot.inValidRange },
              { name: "Mean Relative Humidity", val: `${dollarSpot.meanHumidity}%`, flag: "—", ok: true },
              {
                name: "N Applied YTD",
                val: nAppliedYtd != null ? `${nAppliedYtd.toFixed(1)} lbs/M${nTarget ? ` / ${nTarget.toFixed(1)}` : ""}` : "Not tracked",
                flag: nAppliedYtd != null && nTarget != null && nAppliedYtd < nTarget * 0.5 ? "BEHIND PACE" : "—",
                ok: !(nAppliedYtd != null && nTarget != null && nAppliedYtd < nTarget * 0.5),
              },
              {
                name: "Days Since Last Fungicide",
                val: daysSinceLastSpray != null ? `${daysSinceLastSpray} days` : "None logged",
                flag: daysSinceLastSpray != null && daysSinceLastSpray > 21 ? "OVERDUE FOR ROTATION" : "—",
                ok: !(daysSinceLastSpray != null && daysSinceLastSpray > 21),
              },
            ].map((f) => (
              <div
                key={f.name}
                className="flex items-center justify-between px-2.5 py-1.5 bg-chalk rounded mb-1.5 text-xs gap-2"
              >
                <span className="text-ink flex-1">{f.name}</span>
                <span className="font-mono font-semibold text-green-mid">{f.val}</span>
                {f.flag !== "—" && (
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded font-mono whitespace-nowrap ${
                      f.ok ? "bg-green-pale text-green-mid" : "bg-red/10 text-red"
                    }`}
                  >
                    {f.flag}
                  </span>
                )}
              </div>
            ))}
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-mist font-mono mb-2.5">
              Guidance
            </div>
            <div className="border-[1.5px] border-rule rounded-[7px] overflow-hidden">
              <div
                className={`px-3 py-2 text-[10px] font-bold uppercase tracking-wide ${
                  dsAboveThreshold ? "bg-red/10 text-red" : "bg-green-pale text-green-mid"
                }`}
              >
                {dsAboveThreshold ? "⚠️ Above the 20% action threshold" : "✓ Below the 20% action threshold"}
              </div>
              <div className="p-3 text-xs text-ink leading-relaxed">
                {dsAboveThreshold
                  ? "Model output exceeds the literature-recommended 20% spray threshold. Consider a preventive fungicide application in the next 1–2 days if not already covered."
                  : "Model output is below the 20% action threshold. No immediate fungicide action indicated — continue monitoring as conditions change."}
                <div className="mt-2 text-[10px] text-mist">
                  This tool tracks your logged spray history below but doesn&apos;t recommend specific
                  products — weigh this alongside your own fungicide rotation program.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showCoolSeasonDiseases && (
        <div className="bg-white border-[1.5px] border-rule rounded-[10px] overflow-hidden shrink-0">
          <div className="bg-green-dark p-5 grid grid-cols-[1fr_auto] gap-4 items-center">
            <div>
              <div className="font-serif text-xl text-white mb-1">Anthracnose</div>
              <div className="text-[11px] text-white/50 italic mb-2.5">Colletotrichum cereale</div>
              <div className="text-[10px] text-white/40 font-mono">
                Danneberger, Vargas &amp; Jones (1984) severity index · course-level weather station
              </div>
            </div>
            <div className="text-center">
              <div className="font-mono text-3xl font-bold text-white leading-none">
                {anthracnose.asi.toFixed(1)}
              </div>
              <div className="text-[9px] text-white/45 uppercase tracking-wide mt-0.5">Severity Index</div>
              <div
                className={`text-[10px] font-bold mt-2 font-mono ${
                  anthracnose.elevated ? "text-red" : "text-green-bright"
                }`}
              >
                ● {anthracnose.elevated ? "ABOVE" : "BELOW"} {anthracnose.actionThreshold} THRESHOLD
              </div>
            </div>
          </div>
          <div className="p-5 grid grid-cols-2 gap-5">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-mist font-mono mb-2.5">
                Model Inputs (trailing 24h)
              </div>
              {[
                { name: "Mean Air Temp", val: `${anthracnose.meanTempF}°F` },
                { name: "Leaf Wetness Hours", val: `${anthracnose.leafWetnessHours} hrs` },
              ].map((f) => (
                <div
                  key={f.name}
                  className="flex items-center justify-between px-2.5 py-1.5 bg-chalk rounded mb-1.5 text-xs gap-2"
                >
                  <span className="text-ink flex-1">{f.name}</span>
                  <span className="font-mono font-semibold text-green-mid">{f.val}</span>
                </div>
              ))}
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-mist font-mono mb-2.5">
                Guidance
              </div>
              <div className="border-[1.5px] border-rule rounded-[7px] overflow-hidden">
                <div
                  className={`px-3 py-2 text-[10px] font-bold uppercase tracking-wide ${
                    anthracnose.elevated ? "bg-red/10 text-red" : "bg-green-pale text-green-mid"
                  }`}
                >
                  {anthracnose.elevated ? `⚠️ Above the ASI > ${anthracnose.actionThreshold} threshold` : `✓ Below the ASI > ${anthracnose.actionThreshold} threshold`}
                </div>
                <div className="p-3 text-xs text-ink leading-relaxed">
                  {anthracnose.elevated
                    ? "On sites with a history of anthracnose, infection is considered possible above this threshold. Consider a preventive fungicide application, and reduce plant stress (raise mowing height, avoid N deficiency) where practical."
                    : "Model output is below the infection-conducive threshold. No immediate fungicide action indicated — continue monitoring as conditions change."}
                  <div className="mt-2 text-[10px] text-mist">
                    Developed and validated for foliar anthracnose on annual bluegrass (Poa annua); not
                    separately validated for creeping bentgrass, and doesn&apos;t cover the more
                    destructive crown-rot phase.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className={`bg-white border-[1.5px] border-rule rounded-[10px] p-5 grid gap-5 ${showCoolSeasonDiseases ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2"}`}>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-mist font-mono mb-2.5">
            Pythium Blight — trailing 24h
          </div>
          <div className="text-xs text-mist leading-relaxed">
            Max temp <strong className="text-ink">{pythium.maxTempF}°F</strong> · Min temp{" "}
            <strong className="text-ink">{pythium.minTempF}°F</strong> · RH ≥90% for{" "}
            <strong className="text-ink">{pythium.hoursRhAbove90} hrs</strong>
            <div className="mt-1.5 text-[10px]">
              Elevated when: max &gt;86°F, min &gt;68°F, and RH≥90% for 14+ hrs (Nutter-Shane threshold model).
            </div>
          </div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-mist font-mono mb-2.5">
            Brown Patch — trailing 24h
          </div>
          <div className="text-xs text-mist leading-relaxed">
            Overnight low <strong className="text-ink">{brownPatch.overnightLowF}°F</strong> · RH ≥95%
            for <strong className="text-ink">{brownPatch.hoursRhAbove95} hrs</strong>
            <div className="mt-1.5 text-[10px]">
              Elevated when: low &gt;68°F and RH≥95% for 6+ hrs (qualitative extension heuristic — no
              formally validated model exists for Brown Patch).
            </div>
          </div>
        </div>
        {showCoolSeasonDiseases && (
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-mist font-mono mb-2.5">
              Fusarium Patch — trailing 24h
            </div>
            <div className="text-xs text-mist leading-relaxed">
              Mean temp <strong className="text-ink">{fusariumPatch.meanTempF}°F</strong> · Leaf wetness{" "}
              <strong className="text-ink">{fusariumPatch.wetHours} hrs</strong>
              <div className="mt-1.5 text-[10px]">
                Elevated when: mean temp 32–59°F and leaf wetness ≥10 hrs (qualitative extension
                heuristic drawn from turf pathology literature — no formally validated numeric model
                exists for Fusarium/Microdochium Patch).
              </div>
            </div>
          </div>
        )}
      </div>

      {showSpringDeadSpot && (
        <div className="bg-white border-[1.5px] border-rule rounded-[10px] overflow-hidden shrink-0">
          <div className="bg-green-dark p-5">
            <div className="font-serif text-xl text-white mb-1">Spring Dead Spot</div>
            <div className="text-[11px] text-white/50 italic mb-2.5">Ophiosphaerella spp.</div>
            <div className="text-[10px] text-white/40 font-mono">
              Fall soil-temp infection window · risk-factor tracking, not an acute spray model
            </div>
          </div>
          <div className="p-5 grid grid-cols-2 gap-5">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-mist font-mono mb-2.5">
                Fall Infection Window
              </div>
              <div className="flex items-center justify-between px-2.5 py-1.5 bg-chalk rounded mb-1.5 text-xs gap-2">
                <span className="text-ink flex-1">Soil Temp (6cm)</span>
                <span className="font-mono font-semibold text-green-mid">
                  {springDeadSpot.soilTempF != null ? `${springDeadSpot.soilTempF.toFixed(1)}°F` : "Unavailable"}
                </span>
              </div>
              <div className="flex items-center justify-between px-2.5 py-1.5 bg-chalk rounded mb-1.5 text-xs gap-2">
                <span className="text-ink flex-1">Status</span>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded font-mono ${springDeadSpot.inFallWindow ? "bg-red/10 text-red" : "bg-green-pale text-green-mid"}`}>
                  {springDeadSpot.inFallWindow ? "IN FALL WINDOW" : "OUT OF WINDOW"}
                </span>
              </div>
              <div className="mt-2 text-[10px] text-mist">
                Infection-conducive when soil temp is 50–70°F and cooling (declining through fall) —
                not just any time soil temp happens to pass through this band, since it also occurs
                during spring warm-up when infection risk has already passed for the season.
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-mist font-mono mb-2.5">
                Risk Factors
              </div>
              {[
                { name: "Fall N Applied", flagged: fallNRisk, detail: fallNRisk ? "Logged within 90 days, in-window" : "None flagged" },
                { name: "Soil pH (alkaline)", flagged: soilPhRisk, detail: latestSoilTest?.ph != null ? `${latestSoilTest.ph.toFixed(1)}` : "Not tested" },
                { name: "Potassium (low)", flagged: soilKRisk, detail: latestSoilTest?.potassium_ppm != null ? `${latestSoilTest.potassium_ppm} ppm` : "Not tested" },
              ].map((f) => (
                <div key={f.name} className="flex items-center justify-between px-2.5 py-1.5 bg-chalk rounded mb-1.5 text-xs gap-2">
                  <span className="text-ink flex-1">{f.name}</span>
                  <span className="font-mono text-mist">{f.detail}</span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded font-mono ${f.flagged ? "bg-red/10 text-red" : "bg-green-pale text-green-mid"}`}>
                    {f.flagged ? "⚠️" : "✓"}
                  </span>
                </div>
              ))}
              <div className="mt-2 text-[10px] text-mist">
                Excess/late fall nitrogen, potassium deficiency, and alkaline soil pH are documented
                risk factors (thatch is another, but isn&apos;t tracked in Turf IQ). Control is
                fall-preventive (cultural practice + fungicide timed to the infection window above) —
                there&apos;s no rescue treatment once infected, and symptoms visible in spring reflect
                last fall&apos;s conditions, not anything actionable today.
              </div>
            </div>
          </div>
        </div>
      )}

      <div id="disease-application-log" className="bg-white border-[1.5px] border-rule rounded-[10px] overflow-hidden shrink-0">
        <div className="flex items-center justify-between px-5 py-4 border-b-[1.5px] border-rule">
          <div className="font-serif text-lg text-green-dark">Fungicide Application Log</div>
          <button
            onClick={() => printSection("disease-application-log")}
            className="px-3.5 py-1.5 border-[1.5px] border-rule text-ink text-xs font-semibold rounded-lg hover:border-green-mid transition-colors no-print"
          >
            Print
          </button>
        </div>

        {sprays.length === 0 ? (
          <div className="p-10 text-center">
            <div className="text-4xl mb-3">🧪</div>
            <div className="text-sm text-mist">No fungicide applications logged yet. Log one from the button above the tabs.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="text-[10px] font-mono uppercase tracking-wider text-mist border-b border-rule">
                <th className="text-left px-5 py-2.5 font-medium">Applied At</th>
                <th className="text-left px-3 py-2.5 font-medium">Target</th>
                <th className="text-left px-3 py-2.5 font-medium">Area</th>
                <th className="text-left px-3 py-2.5 font-medium">Product</th>
                <th className="text-left px-3 py-2.5 font-medium">REI</th>
                <th className="text-left px-3 py-2.5 font-medium">Cost</th>
                <th className="text-left px-3 py-2.5 font-medium">Status</th>
                <th className="text-left px-3 py-2.5 font-medium">Notes</th>
                <th className="text-right px-5 py-2.5 font-medium no-print">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sprays.map((s) =>
                editingId === s.id ? (
                  <PestApplicationEditRow
                    key={s.id}
                    app={s}
                    resolvedCategory="fungicide"
                    products={products}
                    colSpan={9}
                    onCancel={() => setEditingId(null)}
                    onSaved={(updated) => {
                      setSprays((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
                      setEditingId(null);
                    }}
                  />
                ) : (
                  <tr key={s.id} className="border-b border-rule last:border-0">
                    <td className="px-5 py-2.5 text-mist">{new Date(s.applied_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</td>
                    <td className="px-3 py-2.5 font-medium">{s.target || "—"}</td>
                    <td className="px-3 py-2.5 text-mist">{s.area || "—"}</td>
                    <td className="px-3 py-2.5">{s.product}</td>
                    <td className="px-3 py-2.5 font-mono">{s.rei_hours}h</td>
                    <td className="px-3 py-2.5 font-mono">{s.cost != null ? `$${Number(s.cost).toFixed(2)}` : "—"}</td>
                    <td className="px-3 py-2.5">
                      {(() => {
                        const restricted = now < new Date(s.applied_at).getTime() + s.rei_hours * 60 * 60 * 1000;
                        return (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded font-mono ${restricted ? "bg-red/10 text-red" : "bg-green-pale text-green-mid"}`}>
                            {restricted ? "RESTRICTED" : "CLEAR"}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-2.5 text-mist">{s.notes || "—"}</td>
                    <td className="px-5 py-2.5 text-right no-print whitespace-nowrap">
                      <button onClick={() => setEditingId(s.id)} className="text-mist text-xs font-semibold hover:text-green-mid mr-3">
                        Edit
                      </button>
                      <button onClick={() => handleDeleteSpray(s.id)} className="text-mist text-xs font-semibold hover:text-red">
                        Delete
                      </button>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </>
  );
}
