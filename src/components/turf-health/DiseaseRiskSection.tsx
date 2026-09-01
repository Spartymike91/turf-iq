"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { resolveCourseIdClient } from "@/lib/supabase/course-context";
import type { WeatherResult } from "@/lib/weather";
import { COURSE_AREAS } from "@/lib/areas";
import { recordApplicationExpense } from "@/lib/applicationExpenses";
import { isDiseaseTarget } from "@/lib/pestCategorization";
import { printSection } from "@/lib/printSection";

interface SprayApplication {
  id: string;
  course_id: string;
  applied_at: string;
  target: string;
  area: string | null;
  product: string;
  product_id: string | null;
  rei_hours: number;
  quantity_used: number | null;
  cost: number | null;
  notes: string | null;
}

interface Product {
  id: string;
  name: string;
  category: string;
  unit: string;
  unit_cost: number | null;
  current_stock: number;
}

const emptySprayForm = { target: "", area: "", applied_at: "", notes: "" };
const emptySprayLine = { productId: "", customName: "", rei_hours: "", quantity_used: "", cost: "" };

export default function DiseaseRiskSection() {
  const [courseId, setCourseId] = useState<string | null>(null);
  const [courseName, setCourseName] = useState("");
  const [grassType, setGrassType] = useState("");
  const [weather, setWeather] = useState<WeatherResult | null>(null);
  const [nAppliedYtd, setNAppliedYtd] = useState<number | null>(null);
  const [nTarget, setNTarget] = useState<number | null>(null);
  const [sprays, setSprays] = useState<SprayApplication[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sprayError, setSprayError] = useState<string | null>(null);
  const [showAddSpray, setShowAddSpray] = useState(false);
  const [addSprayForm, setAddSprayForm] = useState(emptySprayForm);
  const [sprayLines, setSprayLines] = useState([{ ...emptySprayLine }]);
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

      setCourseId(context.courseId);
      const { data: course } = await supabase
        .from("courses")
        .select("name, grass_type")
        .eq("id", context.courseId)
        .single();

      setCourseName(course?.name ?? "");
      setGrassType(course?.grass_type ?? "");

      const fiscalYear = new Date().getFullYear();
      const [{ data: program }, { data: apps }, { data: sprayRows }, { data: prods }] = await Promise.all([
        supabase
          .from("fertility_programs")
          .select("annual_n_target")
          .eq("course_id", context.courseId)
          .eq("fiscal_year", fiscalYear)
          .maybeSingle(),
        supabase
          .from("fertilizer_applications")
          .select("n_lbs_per_1000")
          .eq("course_id", context.courseId)
          .gte("application_date", `${fiscalYear}-01-01`),
        supabase
          .from("pest_applications")
          .select("*")
          .eq("course_id", context.courseId)
          .order("applied_at", { ascending: false }),
        supabase
          .from("products")
          .select("id, name, category, unit, unit_cost, current_stock")
          .eq("course_id", context.courseId)
          .eq("is_active", true)
          .in("category", ["fungicide", "other"])
          .order("name"),
      ]);
      setNTarget(program ? Number(program.annual_n_target) : null);
      setNAppliedYtd((apps ?? []).reduce((sum, a) => sum + Number(a.n_lbs_per_1000), 0));
      setSprays((sprayRows ?? []).filter((s) => isDiseaseTarget(s.target)));
      setProducts(prods ?? []);

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

  function updateSprayLine(index: number, patch: Partial<typeof emptySprayLine>) {
    setSprayLines((prev) =>
      prev.map((l, i) => {
        if (i !== index) return l;
        const next = { ...l, ...patch };
        // Auto-compute cost from the directory product's unit cost whenever
        // the product or quantity changes — still editable afterward, but a
        // later edit to either will recompute and overwrite a manual value.
        if ("productId" in patch || "quantity_used" in patch) {
          const product = products.find((p) => p.id === next.productId);
          const qty = parseFloat(next.quantity_used);
          if (product?.unit_cost != null && !Number.isNaN(qty)) {
            next.cost = (Number(product.unit_cost) * qty).toFixed(2);
          }
        }
        return next;
      })
    );
  }

  function addSprayLine() {
    setSprayLines((prev) => [...prev, { ...emptySprayLine }]);
  }

  function removeSprayLine(index: number) {
    setSprayLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  async function handleAddSpray(e: React.FormEvent) {
    e.preventDefault();
    const validLines = sprayLines.filter((l) => l.productId || l.customName);
    if (!courseId || !addSprayForm.target || !addSprayForm.area || validLines.length === 0) return;
    setSaving(true);
    setSprayError(null);
    const supabase = createClient();
    const appliedAt = addSprayForm.applied_at ? new Date(addSprayForm.applied_at).toISOString() : new Date().toISOString();

    const rows = validLines.map((l) => {
      const product = products.find((p) => p.id === l.productId);
      return {
        course_id: courseId,
        applied_at: appliedAt,
        target: addSprayForm.target,
        area: addSprayForm.area,
        product: product ? product.name : l.customName,
        product_id: product ? product.id : null,
        rei_hours: l.rei_hours ? parseInt(l.rei_hours) : 0,
        quantity_used: product && l.quantity_used ? parseFloat(l.quantity_used) : null,
        cost: l.cost ? parseFloat(l.cost) : null,
        notes: addSprayForm.notes || null,
      };
    });

    const { data, error: insertError } = await supabase.from("pest_applications").insert(rows).select();

    if (insertError) {
      setSprayError(insertError.message);
    } else if (data) {
      setSprays((prev) => [...prev, ...data].sort((a, b) => b.applied_at.localeCompare(a.applied_at)));

      for (const line of validLines) {
        const product = products.find((p) => p.id === line.productId);
        if (product && line.quantity_used) {
          const newStock = Number(product.current_stock) - parseFloat(line.quantity_used);
          const { error: stockError } = await supabase
            .from("products")
            .update({ current_stock: newStock })
            .eq("id", product.id);
          if (!stockError) {
            setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, current_stock: newStock } : p)));
          }
        }
      }

      // Best-effort: record a matching budget expense for any line with a cost.
      for (const row of data) {
        if (row.cost) {
          try {
            await recordApplicationExpense(supabase, {
              courseId,
              categoryName: "Chemicals",
              amount: Number(row.cost),
              description: `${row.product} — ${row.target}${row.area ? ` (${row.area})` : ""}`,
              expenseDate: row.applied_at.slice(0, 10),
              source: "application_pest",
              pestApplicationId: row.id,
            });
          } catch (expenseError) {
            console.error("Failed to record fungicide application expense:", expenseError);
          }
        }
      }

      setAddSprayForm(emptySprayForm);
      setSprayLines([{ ...emptySprayLine }]);
      setShowAddSpray(false);
      setNow(Date.now());
    }
    setSaving(false);
  }

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

      <div id="disease-application-log" className="bg-white border-[1.5px] border-rule rounded-[10px] overflow-hidden shrink-0">
        <div className="flex items-center justify-between px-5 py-4 border-b-[1.5px] border-rule">
          <div className="font-serif text-lg text-green-dark">Fungicide Application Log</div>
          <div className="flex items-center gap-2 no-print">
            <button
              onClick={() => printSection("disease-application-log")}
              className="px-3.5 py-1.5 border-[1.5px] border-rule text-ink text-xs font-semibold rounded-lg hover:border-green-mid transition-colors"
            >
              Print
            </button>
            <button
              onClick={() => setShowAddSpray((v) => !v)}
              className="px-3.5 py-1.5 bg-green-mid text-white text-xs font-semibold rounded-lg hover:bg-green-dark transition-colors"
            >
              {showAddSpray ? "Cancel" : "+ Log Application"}
            </button>
          </div>
        </div>

        {showAddSpray && (
          <form onSubmit={handleAddSpray} className="flex flex-col gap-3 px-5 py-4 border-b-[1.5px] border-rule bg-chalk no-print">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wide">Target</label>
                <input
                  type="text"
                  required
                  list="disease-target-suggestions"
                  value={addSprayForm.target}
                  onChange={(e) => setAddSprayForm({ ...addSprayForm, target: e.target.value })}
                  placeholder="Dollar Spot"
                  className="w-40 px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid focus:ring-2 focus:ring-green-mid/10"
                />
                <datalist id="disease-target-suggestions">
                  <option value="Dollar Spot" />
                  <option value="Pythium Blight" />
                  <option value="Brown Patch" />
                  <option value="Large Patch" />
                </datalist>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wide">Area</label>
                <select
                  required
                  value={addSprayForm.area}
                  onChange={(e) => setAddSprayForm({ ...addSprayForm, area: e.target.value })}
                  className="w-36 px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid"
                >
                  <option value="" disabled>
                    Select area
                  </option>
                  {COURSE_AREAS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wide">Applied At</label>
                <input
                  type="datetime-local"
                  value={addSprayForm.applied_at}
                  onChange={(e) => setAddSprayForm({ ...addSprayForm, applied_at: e.target.value })}
                  className="px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid"
                />
              </div>
              <div className="flex flex-col gap-1.5 flex-1 min-w-[140px]">
                <label className="text-[11px] font-semibold uppercase tracking-wide">Notes</label>
                <input
                  type="text"
                  value={addSprayForm.notes}
                  onChange={(e) => setAddSprayForm({ ...addSprayForm, notes: e.target.value })}
                  placeholder="Full course, preventive rotation"
                  className="px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid focus:ring-2 focus:ring-green-mid/10"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-semibold uppercase tracking-wide">
                Products <span className="text-mist font-normal normal-case">— log a tank mix in one pass</span>
              </label>
              {sprayLines.map((line, i) => {
                const linkedProduct = products.find((p) => p.id === line.productId);
                return (
                  <div key={i} className="flex flex-wrap items-end gap-2">
                    <select
                      value={line.productId}
                      onChange={(e) => updateSprayLine(i, { productId: e.target.value })}
                      className="w-40 px-2 py-1.5 border-[1.5px] border-rule rounded text-xs outline-none focus:border-green-mid"
                    >
                      <option value="">— Custom / not in directory —</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    {!line.productId && (
                      <input
                        required
                        value={line.customName}
                        onChange={(e) => updateSprayLine(i, { customName: e.target.value })}
                        placeholder="Daconil Ultrex"
                        className="w-36 px-2 py-1.5 border-[1.5px] border-rule rounded text-xs outline-none focus:border-green-mid"
                      />
                    )}
                    <input
                      type="number"
                      value={line.rei_hours}
                      onChange={(e) => updateSprayLine(i, { rei_hours: e.target.value })}
                      placeholder="REI hrs"
                      className="w-20 px-2 py-1.5 border-[1.5px] border-rule rounded text-xs outline-none focus:border-green-mid"
                    />
                    {linkedProduct && (
                      <input
                        type="number"
                        step="0.01"
                        value={line.quantity_used}
                        onChange={(e) => updateSprayLine(i, { quantity_used: e.target.value })}
                        placeholder={`Qty used (${linkedProduct.unit})`}
                        title={`Deducted from stock (currently ${linkedProduct.current_stock} ${linkedProduct.unit})`}
                        className="w-32 px-2 py-1.5 border-[1.5px] border-rule rounded text-xs outline-none focus:border-green-mid"
                      />
                    )}
                    <input
                      type="number"
                      step="0.01"
                      value={line.cost}
                      onChange={(e) => updateSprayLine(i, { cost: e.target.value })}
                      placeholder="Cost"
                      title={linkedProduct ? "Auto-filled from unit cost × quantity used — editable" : "Cost"}
                      className="w-20 px-2 py-1.5 border-[1.5px] border-rule rounded text-xs outline-none focus:border-green-mid"
                    />
                    {sprayLines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeSprayLine(i)}
                        className="text-mist text-xs font-semibold hover:text-red"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                );
              })}
              <button
                type="button"
                onClick={addSprayLine}
                className="self-start text-xs font-semibold text-green-mid hover:text-green-dark"
              >
                + Add Product
              </button>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="self-start px-4 py-2 bg-green-mid text-white text-sm font-semibold rounded-lg hover:bg-green-dark transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </form>
        )}

        {sprayError && <div className="px-5 py-2 text-xs text-red bg-red/5">{sprayError}</div>}

        {sprays.length === 0 ? (
          <div className="p-10 text-center">
            <div className="text-4xl mb-3">🧪</div>
            <div className="text-sm text-mist">No fungicide applications logged yet. Add your first one above.</div>
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
              {sprays.map((s) => {
                const appliedMs = new Date(s.applied_at).getTime();
                const clearAt = appliedMs + s.rei_hours * 60 * 60 * 1000;
                const restricted = now < clearAt;
                return (
                  <tr key={s.id} className="border-b border-rule last:border-0">
                    <td className="px-5 py-2.5 text-mist">{new Date(s.applied_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</td>
                    <td className="px-3 py-2.5 font-medium">{s.target}</td>
                    <td className="px-3 py-2.5 text-mist">{s.area || "—"}</td>
                    <td className="px-3 py-2.5">{s.product}</td>
                    <td className="px-3 py-2.5 font-mono">{s.rei_hours}h</td>
                    <td className="px-3 py-2.5 font-mono">{s.cost != null ? `$${Number(s.cost).toFixed(2)}` : "—"}</td>
                    <td className="px-3 py-2.5">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded font-mono ${restricted ? "bg-red/10 text-red" : "bg-green-pale text-green-mid"}`}>
                        {restricted ? "RESTRICTED" : "CLEAR"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-mist">{s.notes || "—"}</td>
                    <td className="px-5 py-2.5 text-right no-print">
                      <button onClick={() => handleDeleteSpray(s.id)} className="text-mist text-xs font-semibold hover:text-red">
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </>
  );
}
