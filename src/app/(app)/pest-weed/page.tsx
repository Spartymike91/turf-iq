"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { resolveCourseIdClient } from "@/lib/supabase/course-context";
import type { WeatherResult } from "@/lib/weather";
import { getCrabgrassStatus, getWhiteGrubStatus, getAbwStatus, isCoolSeasonGrass } from "@/lib/pestModels";

interface PestApplication {
  id: string;
  course_id: string;
  applied_at: string;
  target: string;
  product: string;
  rei_hours: number;
  notes: string | null;
}

const emptyForm = { target: "", product: "", applied_at: "", rei_hours: "", notes: "" };

function toLocalDatetimeInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function PestWeedPage() {
  const [courseId, setCourseId] = useState<string | null>(null);
  const [courseName, setCourseName] = useState("");
  const [grassType, setGrassType] = useState("");
  const [weather, setWeather] = useState<WeatherResult | null>(null);
  const [daysTracked, setDaysTracked] = useState(0);
  const [applications, setApplications] = useState<PestApplication[]>([]);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState(emptyForm);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

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
        .select("name, grass_type")
        .eq("id", context.courseId)
        .single();
      setCourseName(course?.name ?? "");
      setGrassType(course?.grass_type ?? "");

      const fiscalYear = new Date().getFullYear();
      const [{ count }, { data: apps }] = await Promise.all([
        supabase
          .from("gdd_daily_log")
          .select("id", { count: "exact", head: true })
          .eq("course_id", context.courseId)
          .gte("log_date", `${fiscalYear}-01-01`),
        supabase
          .from("pest_applications")
          .select("*")
          .eq("course_id", context.courseId)
          .order("applied_at", { ascending: false }),
      ]);
      setDaysTracked(count ?? 0);
      setApplications(apps ?? []);

      try {
        const res = await fetch("/api/weather");
        const data = await res.json();
        if (res.ok) setWeather(data);
      } catch {
        // pest/weed page still works without weather (spray log is independent)
      }

      setChecking(false);
    }
    load();
  }, []);

  const dayOfYear = useMemo(
    () => Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000),
    []
  );
  const trackingGapDays = dayOfYear - daysTracked;

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!courseId || !addForm.target || !addForm.product) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("pest_applications")
      .insert({
        course_id: courseId,
        applied_at: addForm.applied_at ? new Date(addForm.applied_at).toISOString() : new Date().toISOString(),
        target: addForm.target,
        product: addForm.product,
        rei_hours: addForm.rei_hours ? parseInt(addForm.rei_hours) : 0,
        notes: addForm.notes || null,
      })
      .select()
      .single();

    if (insertError) {
      setError(insertError.message);
    } else if (data) {
      setApplications((prev) =>
        [...prev, data].sort((a, b) => b.applied_at.localeCompare(a.applied_at))
      );
      setAddForm(emptyForm);
      setShowAdd(false);
      setNow(Date.now());
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    const supabase = createClient();
    const { error: deleteError } = await supabase.from("pest_applications").delete().eq("id", id);
    if (!deleteError) setApplications((prev) => prev.filter((a) => a.id !== id));
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
        <div className="text-sm text-mist">Set up your course profile before tracking pest &amp; weed timing.</div>
      </div>
    );
  }

  const gdd = weather?.agronomics.gddSeasonToDate ?? null;
  const crabgrass = gdd != null ? getCrabgrassStatus(gdd) : null;
  const whiteGrub = gdd != null ? getWhiteGrubStatus(gdd) : null;
  const showAbw = isCoolSeasonGrass(grassType);
  const abw = showAbw && gdd != null ? getAbwStatus(gdd) : null;

  const cards = [
    crabgrass && { name: "Crabgrass", badge: "MODEL", badgeColor: "bg-green-mid", status: crabgrass },
    whiteGrub && { name: "White Grub", badge: "GUIDANCE RANGE", badgeColor: "bg-amber", status: whiteGrub },
    abw && { name: "Annual Bluegrass Weevil", badge: "MODEL", badgeColor: "bg-green-mid", status: abw },
  ].filter((c): c is { name: string; badge: string; badgeColor: string; status: ReturnType<typeof getCrabgrassStatus> } => Boolean(c));

  return (
    <>
      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-green-forest mb-1">
          Pest &amp; Weed Control
        </div>
        <div className="font-serif text-2xl text-green-dark">Integrated Pest Management</div>
        <div className="text-[13px] text-mist mt-1">
          {gdd != null ? `${gdd.toFixed(0)} GDD (Base 50°F)` : "GDD unavailable"} · {grassType || "—"} · {courseName}
        </div>
      </div>

      {trackingGapDays > 14 && (
        <div className="bg-blue/5 border-[1.5px] border-blue/40 rounded-[7px] px-4 py-3 text-[11px] text-mist">
          GDD tracking only has {daysTracked} day{daysTracked === 1 ? "" : "s"} of history this season (day{" "}
          {dayOfYear} of the year) — season-to-date GDD above may understate the true accumulation if this
          course started using Turf IQ partway through the season. Treat pest windows below cautiously until
          more tracking history builds up.
        </div>
      )}

      {!weather && (
        <div className="bg-white border-[1.5px] border-rule rounded-[10px] p-6 text-center">
          <div className="text-sm text-mist">GDD-based pest timing needs live weather data, which is unavailable right now.</div>
        </div>
      )}

      {cards.length > 0 && (
        <div className={`grid gap-3`} style={{ gridTemplateColumns: `repeat(${cards.length}, minmax(0, 1fr))` }}>
          {cards.map((c) => (
            <div
              key={c.name}
              className={`bg-white border-[1.5px] rounded-lg p-3.5 ${c.status.elevated ? "border-amber" : "border-rule"}`}
            >
              <div className="flex items-center justify-between gap-1.5 mb-1.5">
                <span className="text-[11px] font-semibold text-ink">{c.name}</span>
                <span className={`text-[8px] font-bold px-1 py-0.5 rounded text-white font-mono ${c.badgeColor}`}>
                  {c.badge}
                </span>
              </div>
              <div className={`text-sm font-semibold mb-1 ${c.status.elevated ? "text-amber" : "text-green-mid"}`}>
                {c.status.stage}
              </div>
              <div className="text-[11px] text-mist leading-relaxed">{c.status.detail}</div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="bg-red/5 border-[1.5px] border-red/40 rounded-lg px-4 py-2 text-xs text-red">{error}</div>
      )}

      <div className="bg-white border-[1.5px] border-rule rounded-[10px] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b-[1.5px] border-rule">
          <div className="font-serif text-lg text-green-dark">Application Log — REI Compliance</div>
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="px-3.5 py-1.5 bg-green-mid text-white text-xs font-semibold rounded-lg hover:bg-green-dark transition-colors"
          >
            {showAdd ? "Cancel" : "+ Log Application"}
          </button>
        </div>

        {showAdd && (
          <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3 px-5 py-4 border-b-[1.5px] border-rule bg-chalk">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide">Target</label>
              <input
                type="text"
                required
                value={addForm.target}
                onChange={(e) => setAddForm({ ...addForm, target: e.target.value })}
                placeholder="Crabgrass"
                className="w-32 px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid focus:ring-2 focus:ring-green-mid/10"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide">Product</label>
              <input
                type="text"
                required
                value={addForm.product}
                onChange={(e) => setAddForm({ ...addForm, product: e.target.value })}
                placeholder="Dimension 2EW"
                className="px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid focus:ring-2 focus:ring-green-mid/10"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide">Applied At</label>
              <input
                type="datetime-local"
                value={addForm.applied_at}
                onChange={(e) => setAddForm({ ...addForm, applied_at: e.target.value })}
                placeholder={toLocalDatetimeInput(new Date())}
                className="px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide">REI (hrs)</label>
              <input
                type="number"
                value={addForm.rei_hours}
                onChange={(e) => setAddForm({ ...addForm, rei_hours: e.target.value })}
                placeholder="24"
                className="w-20 px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid focus:ring-2 focus:ring-green-mid/10"
              />
            </div>
            <div className="flex flex-col gap-1.5 flex-1 min-w-[140px]">
              <label className="text-[11px] font-semibold uppercase tracking-wide">Notes</label>
              <input
                type="text"
                value={addForm.notes}
                onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })}
                placeholder="Fairways, post-mow"
                className="px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid focus:ring-2 focus:ring-green-mid/10"
              />
            </div>
            <button type="submit" disabled={saving} className="px-4 py-2 bg-green-mid text-white text-sm font-semibold rounded-lg hover:bg-green-dark transition-colors disabled:opacity-50">
              {saving ? "Saving..." : "Save"}
            </button>
          </form>
        )}

        {applications.length === 0 ? (
          <div className="p-10 text-center">
            <div className="text-4xl mb-3">🧪</div>
            <div className="text-sm text-mist">No applications logged yet. Add your first one above.</div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-mono uppercase tracking-wider text-mist border-b border-rule">
                <th className="text-left px-5 py-2.5 font-medium">Applied At</th>
                <th className="text-left px-3 py-2.5 font-medium">Target</th>
                <th className="text-left px-3 py-2.5 font-medium">Product</th>
                <th className="text-left px-3 py-2.5 font-medium">REI</th>
                <th className="text-left px-3 py-2.5 font-medium">Status</th>
                <th className="text-left px-3 py-2.5 font-medium">Notes</th>
                <th className="text-right px-5 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((a) => {
                const appliedMs = new Date(a.applied_at).getTime();
                const clearAt = appliedMs + a.rei_hours * 60 * 60 * 1000;
                const restricted = now < clearAt;
                return (
                  <tr key={a.id} className="border-b border-rule last:border-0">
                    <td className="px-5 py-2.5 text-mist">{new Date(a.applied_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</td>
                    <td className="px-3 py-2.5 font-medium">{a.target}</td>
                    <td className="px-3 py-2.5">{a.product}</td>
                    <td className="px-3 py-2.5 font-mono">{a.rei_hours}h</td>
                    <td className="px-3 py-2.5">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded font-mono ${restricted ? "bg-red/10 text-red" : "bg-green-pale text-green-mid"}`}>
                        {restricted ? "RESTRICTED" : "CLEAR"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-mist">{a.notes || "—"}</td>
                    <td className="px-5 py-2.5 text-right">
                      <button onClick={() => handleDelete(a.id)} className="text-mist text-xs font-semibold hover:text-red">
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
