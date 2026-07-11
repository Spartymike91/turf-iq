"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { WeatherResult } from "@/lib/weather";

export default function DiseasePage() {
  const [courseName, setCourseName] = useState("");
  const [grassType, setGrassType] = useState("");
  const [weather, setWeather] = useState<WeatherResult | null>(null);
  const [nAppliedYtd, setNAppliedYtd] = useState<number | null>(null);
  const [nTarget, setNTarget] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: membership } = await supabase
        .from("course_members")
        .select("course_id, courses(name, grass_type)")
        .eq("user_id", user.id)
        .limit(1)
        .single();

      const course = membership?.courses as unknown as { name: string; grass_type: string } | null;
      setCourseName(course?.name ?? "");
      setGrassType(course?.grass_type ?? "");

      if (membership?.course_id) {
        const fiscalYear = new Date().getFullYear();
        const [{ data: program }, { data: apps }] = await Promise.all([
          supabase
            .from("fertility_programs")
            .select("annual_n_target")
            .eq("course_id", membership.course_id)
            .eq("fiscal_year", fiscalYear)
            .maybeSingle(),
          supabase
            .from("fertilizer_applications")
            .select("n_lbs_per_1000")
            .eq("course_id", membership.course_id)
            .gte("application_date", `${fiscalYear}-01-01`),
        ]);
        setNTarget(program ? Number(program.annual_n_target) : null);
        setNAppliedYtd((apps ?? []).reduce((sum, a) => sum + Number(a.n_lbs_per_1000), 0));
      }

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

  const { dollarSpot, pythium, brownPatch } = weather.diseaseRisk;
  const dsAboveThreshold = dollarSpot.probabilityPct >= dollarSpot.actionThresholdPct;
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
      <div className="grid grid-cols-3 gap-3">
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
        </div>
      </div>

      {/* Dollar Spot Detail Card */}
      <div className="bg-white border-[1.5px] border-rule rounded-[10px] overflow-hidden">
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
                  This tool doesn&apos;t track your spray history or recommend specific products —
                  weigh this alongside your own fungicide rotation program.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border-[1.5px] border-rule rounded-[10px] p-5 grid grid-cols-2 gap-5">
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
      </div>
    </>
  );
}
