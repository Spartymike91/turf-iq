"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { resolveCourseIdClient } from "@/lib/supabase/course-context";
import StatChip from "@/components/ui/StatChip";
import AlertBanner from "@/components/ui/AlertBanner";
import type { WeatherResult } from "@/lib/weather";

const GAL_PER_ACRE_INCH = 27154;

interface IrrigationLog {
  id: string;
  course_id: string;
  cycle_date: string;
  gallons: number;
  duration_minutes: number | null;
  notes: string | null;
}

interface SoilMoistureReading {
  id: string;
  course_id: string;
  zone: string;
  reading_date: string;
  vwc_pct: number;
  notes: string | null;
}

const emptyLogForm = { cycle_date: "", gallons: "", duration_minutes: "", notes: "" };
const emptyReadingForm = { zone: "", reading_date: "", vwc_pct: "", notes: "" };

const DRY_THRESHOLD = 18;
const TARGET_LOW = 22;
const TARGET_HIGH = 28;

export default function IrrigationPage() {
  const fiscalYear = new Date().getFullYear();
  const month = new Date().getMonth();

  const [courseId, setCourseId] = useState<string | null>(null);
  const [courseName, setCourseName] = useState("");
  const [acres, setAcres] = useState<number | null>(null);
  const [weather, setWeather] = useState<WeatherResult | null>(null);
  const [annualBudget, setAnnualBudget] = useState<number>(0);
  const [budgetInput, setBudgetInput] = useState("");
  const [editingBudget, setEditingBudget] = useState(false);
  const [logs, setLogs] = useState<IrrigationLog[]>([]);
  const [readings, setReadings] = useState<SoilMoistureReading[]>([]);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [showAddLog, setShowAddLog] = useState(false);
  const [addLogForm, setAddLogForm] = useState(emptyLogForm);
  const [showAddReading, setShowAddReading] = useState(false);
  const [addReadingForm, setAddReadingForm] = useState(emptyReadingForm);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const context = await resolveCourseIdClient(supabase);

      if (!context) {
        setChecking(false);
        return;
      }

      setCourseId(context.courseId);
      const { data: course } = await supabase
        .from("courses")
        .select("name, maintained_acres")
        .eq("id", context.courseId)
        .single();
      setCourseName(course?.name ?? "");
      setAcres(course?.maintained_acres ?? null);

      const [{ data: program }, { data: logRows }, { data: readingRows }] = await Promise.all([
        supabase
          .from("irrigation_programs")
          .select("*")
          .eq("course_id", context.courseId)
          .eq("fiscal_year", fiscalYear)
          .maybeSingle(),
        supabase
          .from("irrigation_logs")
          .select("*")
          .eq("course_id", context.courseId)
          .gte("cycle_date", `${fiscalYear}-01-01`)
          .lte("cycle_date", `${fiscalYear}-12-31`)
          .order("cycle_date", { ascending: false }),
        supabase
          .from("soil_moisture_readings")
          .select("*")
          .eq("course_id", context.courseId)
          .order("reading_date", { ascending: false }),
      ]);

      if (program) {
        setAnnualBudget(Number(program.annual_water_budget_gal));
        setBudgetInput(String(program.annual_water_budget_gal));
      }
      setLogs(logRows ?? []);
      setReadings(readingRows ?? []);

      try {
        const res = await fetch("/api/weather");
        const data = await res.json();
        if (res.ok) setWeather(data);
      } catch {
        // weather is optional context here; irrigation logs/readings still work without it
      }

      setChecking(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => {
    const monthStart = new Date(fiscalYear, month, 1).toISOString().slice(0, 10);
    const gallonsMtd = logs
      .filter((l) => l.cycle_date >= monthStart)
      .reduce((sum, l) => sum + Number(l.gallons), 0);
    const monthlyBudgetShare = annualBudget / 12;

    const latestByZone = new Map<string, SoilMoistureReading>();
    for (const r of readings) {
      const existing = latestByZone.get(r.zone);
      if (!existing || r.reading_date > existing.reading_date) latestByZone.set(r.zone, r);
    }
    const latestReadings = Array.from(latestByZone.values());
    const avgVwc =
      latestReadings.length > 0
        ? latestReadings.reduce((sum, r) => sum + Number(r.vwc_pct), 0) / latestReadings.length
        : null;
    const dryZones = latestReadings.filter((r) => Number(r.vwc_pct) < DRY_THRESHOLD);

    return { gallonsMtd, monthlyBudgetShare, avgVwc, dryZones };
  }, [logs, readings, annualBudget, fiscalYear, month]);

  async function handleSaveBudget() {
    if (!courseId || !budgetInput) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { data, error: upsertError } = await supabase
      .from("irrigation_programs")
      .upsert(
        { course_id: courseId, fiscal_year: fiscalYear, annual_water_budget_gal: parseFloat(budgetInput) },
        { onConflict: "course_id,fiscal_year" }
      )
      .select()
      .single();

    if (upsertError) {
      setError(upsertError.message);
    } else if (data) {
      setAnnualBudget(Number(data.annual_water_budget_gal));
      setEditingBudget(false);
    }
    setSaving(false);
  }

  async function handleAddLog(e: React.FormEvent) {
    e.preventDefault();
    if (!courseId || !addLogForm.gallons) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("irrigation_logs")
      .insert({
        course_id: courseId,
        cycle_date: addLogForm.cycle_date || new Date().toISOString().slice(0, 10),
        gallons: parseFloat(addLogForm.gallons),
        duration_minutes: addLogForm.duration_minutes ? parseInt(addLogForm.duration_minutes) : null,
        notes: addLogForm.notes || null,
      })
      .select()
      .single();

    if (insertError) {
      setError(insertError.message);
    } else if (data) {
      setLogs((prev) => [...prev, data].sort((a, b) => b.cycle_date.localeCompare(a.cycle_date)));
      setAddLogForm(emptyLogForm);
      setShowAddLog(false);
    }
    setSaving(false);
  }

  async function handleDeleteLog(id: string) {
    const supabase = createClient();
    const { error: deleteError } = await supabase.from("irrigation_logs").delete().eq("id", id);
    if (!deleteError) setLogs((prev) => prev.filter((l) => l.id !== id));
  }

  async function handleAddReading(e: React.FormEvent) {
    e.preventDefault();
    if (!courseId || !addReadingForm.zone || !addReadingForm.vwc_pct) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("soil_moisture_readings")
      .insert({
        course_id: courseId,
        zone: addReadingForm.zone,
        reading_date: addReadingForm.reading_date || new Date().toISOString().slice(0, 10),
        vwc_pct: parseFloat(addReadingForm.vwc_pct),
        notes: addReadingForm.notes || null,
      })
      .select()
      .single();

    if (insertError) {
      setError(insertError.message);
    } else if (data) {
      setReadings((prev) => [...prev, data].sort((a, b) => b.reading_date.localeCompare(a.reading_date)));
      setAddReadingForm(emptyReadingForm);
      setShowAddReading(false);
    }
    setSaving(false);
  }

  async function handleDeleteReading(id: string) {
    const supabase = createClient();
    const { error: deleteError } = await supabase.from("soil_moisture_readings").delete().eq("id", id);
    if (!deleteError) setReadings((prev) => prev.filter((r) => r.id !== id));
  }

  if (checking) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-mist">Loading...</div>
      </div>
    );
  }

  if (!courseId) {
    return (
      <div className="bg-white border-[1.5px] border-rule rounded-[10px] p-6 text-center">
        <div className="font-serif text-xl text-green-dark mb-2">No course found</div>
        <div className="text-sm text-mist">Set up your course profile before tracking irrigation.</div>
      </div>
    );
  }

  const et0In = weather?.agronomics.et0In ?? null;
  const et0Gallons = et0In != null && acres != null ? et0In * acres * GAL_PER_ACRE_INCH : null;
  const weekRainfallIn = weather?.agronomics.weekRainfallIn ?? null;
  const et0WeekIn = weather?.agronomics.et0WeekIn ?? null;
  const weekDeficitIn = et0WeekIn != null && weekRainfallIn != null ? et0WeekIn - weekRainfallIn : null;
  const mtdPct = stats.monthlyBudgetShare > 0 ? (stats.gallonsMtd / stats.monthlyBudgetShare) * 100 : null;

  return (
    <>
      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-green-forest mb-1">
          Irrigation Management
        </div>
        <div className="font-serif text-2xl text-green-dark">Water &amp; Soil Moisture</div>
        <div className="text-[13px] text-mist mt-1">
          {courseName} · ET-based scheduling{acres != null && ` · ${acres} maintained acres`}
        </div>
      </div>

      {stats.dryZones.length > 0 && (
        <AlertBanner
          variant="amber"
          icon="🏜️"
          title={`Dry Spot Alert — ${stats.dryZones.map((z) => z.zone).join(", ")} · below ${DRY_THRESHOLD}% VWC (target ${TARGET_LOW}–${TARGET_HIGH}%)`}
          body={`Latest logged reading${stats.dryZones.length > 1 ? "s" : ""}: ${stats.dryZones
            .map((z) => `${z.zone} ${Number(z.vwc_pct).toFixed(1)}%`)
            .join(", ")}. Consider increasing runtime or a daytime syringe cycle on these zones.`}
        />
      )}

      <div className="grid grid-cols-4 gap-3">
        <StatChip
          label="Tonight's ET Target"
          value={et0In != null ? et0In.toFixed(2) : "—"}
          unit="in"
          sub={et0Gallons != null ? `≈ ${Math.round(et0Gallons).toLocaleString()} gal (full course)` : "Set maintained acres for gallons"}
          valueColor="#ea580c"
        />
        <StatChip
          label="7-Day Rainfall vs. ET"
          value={weekRainfallIn != null ? weekRainfallIn.toFixed(2) : "—"}
          unit="in"
          sub={weekDeficitIn != null ? `${weekDeficitIn >= 0 ? "Deficit" : "Surplus"}: ${Math.abs(weekDeficitIn).toFixed(2)}" vs ${et0WeekIn?.toFixed(2)}" ET demand` : "—"}
          tag={weekDeficitIn != null && weekDeficitIn > 0 ? "Moisture deficit" : weekDeficitIn != null ? "Surplus" : undefined}
          tagColor={weekDeficitIn != null && weekDeficitIn > 0 ? "warn" : "ok"}
          valueColor="#0369a1"
        />
        <StatChip
          label="Water Used — MTD"
          value={stats.gallonsMtd >= 1000 ? `${(stats.gallonsMtd / 1000).toFixed(0)}K` : stats.gallonsMtd.toFixed(0)}
          unit="gal"
          sub={annualBudget > 0 ? `Monthly share: ${Math.round(stats.monthlyBudgetShare).toLocaleString()} gal (annual ÷12)` : "No annual budget set"}
          tag={mtdPct != null ? `${mtdPct.toFixed(0)}% of monthly share` : undefined}
          tagColor={mtdPct != null && mtdPct > 100 ? "warn" : "ok"}
          valueColor="#0369a1"
        />
        <StatChip
          label="Avg Course VWC"
          value={stats.avgVwc != null ? stats.avgVwc.toFixed(1) : "—"}
          unit="%"
          sub={`Target: ${TARGET_LOW}–${TARGET_HIGH}%`}
          tag={
            stats.avgVwc == null
              ? "No readings logged"
              : stats.avgVwc < TARGET_LOW
              ? "Below target"
              : stats.avgVwc > TARGET_HIGH
              ? "Above target"
              : "In range"
          }
          tagColor={
            stats.avgVwc == null ? "blue" : stats.avgVwc < TARGET_LOW || stats.avgVwc > TARGET_HIGH ? "warn" : "ok"
          }
          valueColor="#2d6a4f"
        />
      </div>

      <div className="bg-white border-[1.5px] border-rule rounded-[10px] px-5 py-4 flex items-center justify-between flex-wrap gap-3">
        <div className="text-sm">
          <span className="font-semibold text-green-dark">Annual Water Budget ({fiscalYear}):</span>{" "}
          {editingBudget ? (
            <span className="inline-flex items-center gap-2 ml-1">
              <input
                type="number"
                step="1000"
                value={budgetInput}
                onChange={(e) => setBudgetInput(e.target.value)}
                className="w-32 px-2 py-1 border-[1.5px] border-rule rounded text-sm outline-none focus:border-green-mid"
              />
              <span className="text-mist text-xs">gal/year</span>
              <button onClick={handleSaveBudget} disabled={saving} className="text-green-mid text-xs font-semibold hover:text-green-dark">
                Save
              </button>
              <button
                onClick={() => {
                  setEditingBudget(false);
                  setBudgetInput(String(annualBudget));
                }}
                className="text-mist text-xs font-semibold hover:text-ink"
              >
                Cancel
              </button>
            </span>
          ) : (
            <span className="ml-1 text-mist">
              {annualBudget > 0 ? `${annualBudget.toLocaleString()} gal/year` : "Not set"}{" "}
              <button onClick={() => setEditingBudget(true)} className="text-green-mid font-semibold hover:text-green-dark ml-1">
                Edit
              </button>
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red/5 border-[1.5px] border-red/40 rounded-lg px-4 py-2 text-xs text-red">{error}</div>
      )}

      <div className="bg-white border-[1.5px] border-rule rounded-[10px] overflow-hidden shrink-0">
        <div className="flex items-center justify-between px-5 py-4 border-b-[1.5px] border-rule">
          <div className="font-serif text-lg text-green-dark">Irrigation Log</div>
          <button
            onClick={() => setShowAddLog((v) => !v)}
            className="px-3.5 py-1.5 bg-green-mid text-white text-xs font-semibold rounded-lg hover:bg-green-dark transition-colors"
          >
            {showAddLog ? "Cancel" : "+ Log Cycle"}
          </button>
        </div>

        {showAddLog && (
          <form onSubmit={handleAddLog} className="flex flex-wrap items-end gap-3 px-5 py-4 border-b-[1.5px] border-rule bg-chalk">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide">Date</label>
              <input
                type="date"
                value={addLogForm.cycle_date}
                onChange={(e) => setAddLogForm({ ...addLogForm, cycle_date: e.target.value })}
                className="px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide">Gallons</label>
              <input
                type="number"
                required
                value={addLogForm.gallons}
                onChange={(e) => setAddLogForm({ ...addLogForm, gallons: e.target.value })}
                placeholder="148200"
                className="w-32 px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid focus:ring-2 focus:ring-green-mid/10"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide">Duration (min)</label>
              <input
                type="number"
                value={addLogForm.duration_minutes}
                onChange={(e) => setAddLogForm({ ...addLogForm, duration_minutes: e.target.value })}
                placeholder="123"
                className="w-28 px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid focus:ring-2 focus:ring-green-mid/10"
              />
            </div>
            <div className="flex flex-col gap-1.5 flex-1 min-w-[140px]">
              <label className="text-[11px] font-semibold uppercase tracking-wide">Notes</label>
              <input
                type="text"
                value={addLogForm.notes}
                onChange={(e) => setAddLogForm({ ...addLogForm, notes: e.target.value })}
                placeholder="Full course nightly cycle"
                className="px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid focus:ring-2 focus:ring-green-mid/10"
              />
            </div>
            <button type="submit" disabled={saving} className="px-4 py-2 bg-green-mid text-white text-sm font-semibold rounded-lg hover:bg-green-dark transition-colors disabled:opacity-50">
              {saving ? "Saving..." : "Save"}
            </button>
          </form>
        )}

        {logs.length === 0 ? (
          <div className="p-10 text-center">
            <div className="text-4xl mb-3">💧</div>
            <div className="text-sm text-mist">No irrigation cycles logged yet for {fiscalYear}. Add your first one above.</div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-mono uppercase tracking-wider text-mist border-b border-rule">
                <th className="text-left px-5 py-2.5 font-medium">Date</th>
                <th className="text-left px-3 py-2.5 font-medium">Gallons</th>
                <th className="text-left px-3 py-2.5 font-medium">Duration</th>
                <th className="text-left px-3 py-2.5 font-medium">Notes</th>
                <th className="text-right px-5 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-rule last:border-0">
                  <td className="px-5 py-2.5 text-mist">{log.cycle_date}</td>
                  <td className="px-3 py-2.5 font-mono">{Number(log.gallons).toLocaleString()} gal</td>
                  <td className="px-3 py-2.5 font-mono">{log.duration_minutes != null ? `${log.duration_minutes} min` : "—"}</td>
                  <td className="px-3 py-2.5 text-mist">{log.notes || "—"}</td>
                  <td className="px-5 py-2.5 text-right">
                    <button onClick={() => handleDeleteLog(log.id)} className="text-mist text-xs font-semibold hover:text-red">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="bg-white border-[1.5px] border-rule rounded-[10px] overflow-hidden shrink-0">
        <div className="flex items-center justify-between px-5 py-4 border-b-[1.5px] border-rule">
          <div className="font-serif text-lg text-green-dark">Soil Moisture Readings</div>
          <button
            onClick={() => setShowAddReading((v) => !v)}
            className="px-3.5 py-1.5 bg-green-mid text-white text-xs font-semibold rounded-lg hover:bg-green-dark transition-colors"
          >
            {showAddReading ? "Cancel" : "+ Log Reading"}
          </button>
        </div>

        {showAddReading && (
          <form onSubmit={handleAddReading} className="flex flex-wrap items-end gap-3 px-5 py-4 border-b-[1.5px] border-rule bg-chalk">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide">Zone</label>
              <input
                type="text"
                required
                value={addReadingForm.zone}
                onChange={(e) => setAddReadingForm({ ...addReadingForm, zone: e.target.value })}
                placeholder="Fairway 7"
                className="w-32 px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid focus:ring-2 focus:ring-green-mid/10"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide">Date</label>
              <input
                type="date"
                value={addReadingForm.reading_date}
                onChange={(e) => setAddReadingForm({ ...addReadingForm, reading_date: e.target.value })}
                className="px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide">VWC %</label>
              <input
                type="number"
                step="0.1"
                required
                value={addReadingForm.vwc_pct}
                onChange={(e) => setAddReadingForm({ ...addReadingForm, vwc_pct: e.target.value })}
                placeholder="24.0"
                className="w-24 px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid focus:ring-2 focus:ring-green-mid/10"
              />
            </div>
            <div className="flex flex-col gap-1.5 flex-1 min-w-[140px]">
              <label className="text-[11px] font-semibold uppercase tracking-wide">Notes</label>
              <input
                type="text"
                value={addReadingForm.notes}
                onChange={(e) => setAddReadingForm({ ...addReadingForm, notes: e.target.value })}
                placeholder='Handheld TDR probe, 3" depth'
                className="px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid focus:ring-2 focus:ring-green-mid/10"
              />
            </div>
            <button type="submit" disabled={saving} className="px-4 py-2 bg-green-mid text-white text-sm font-semibold rounded-lg hover:bg-green-dark transition-colors disabled:opacity-50">
              {saving ? "Saving..." : "Save"}
            </button>
          </form>
        )}

        {readings.length === 0 ? (
          <div className="p-10 text-center">
            <div className="text-sm text-mist">
              No soil moisture readings logged yet. Add readings manually (no sensor integration yet) to track zone moisture.
            </div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-mono uppercase tracking-wider text-mist border-b border-rule">
                <th className="text-left px-5 py-2.5 font-medium">Date</th>
                <th className="text-left px-3 py-2.5 font-medium">Zone</th>
                <th className="text-left px-3 py-2.5 font-medium">VWC %</th>
                <th className="text-left px-3 py-2.5 font-medium">Status</th>
                <th className="text-left px-3 py-2.5 font-medium">Notes</th>
                <th className="text-right px-5 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {readings.map((r) => {
                const dry = Number(r.vwc_pct) < DRY_THRESHOLD;
                return (
                  <tr key={r.id} className="border-b border-rule last:border-0">
                    <td className="px-5 py-2.5 text-mist">{r.reading_date}</td>
                    <td className="px-3 py-2.5 font-medium">{r.zone}</td>
                    <td className="px-3 py-2.5 font-mono">{Number(r.vwc_pct).toFixed(1)}%</td>
                    <td className="px-3 py-2.5">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded font-mono ${dry ? "bg-red/10 text-red" : "bg-green-pale text-green-mid"}`}>
                        {dry ? "DRY" : "OK"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-mist">{r.notes || "—"}</td>
                    <td className="px-5 py-2.5 text-right">
                      <button onClick={() => handleDeleteReading(r.id)} className="text-mist text-xs font-semibold hover:text-red">
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
