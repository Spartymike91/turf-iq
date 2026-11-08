"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { resolveCourseIdClient } from "@/lib/supabase/course-context";
import { actualMinutesFor, formatMinutes } from "@/lib/taskDuration";
import { CATEGORY_LABEL, type ProductCategory } from "@/lib/pestCategorization";

const dayName = (d: Date) => d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

function todayLocal(): string {
  const d = new Date();
  return toIso(d);
}
function toIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function parseIso(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function shift(s: string, days: number): string {
  const d = parseIso(s);
  d.setDate(d.getDate() + days);
  return toIso(d);
}
const time = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "—";

interface Weather {
  available: boolean;
  reason?: string;
  highF?: number;
  lowF?: number | null;
  precipIn?: number | null;
  windMaxMph?: number | null;
  conditions?: string | null;
}
interface Task {
  id: string;
  name: string;
  icon: string | null;
  assigned_to: string | null;
  scheduled_date: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  paused_minutes: number | null;
  actual_minutes_override: number | null;
  notes: string | null;
}
interface AppRow {
  key: string;
  kind: string;
  area: string;
  product: string;
  detail: string;
  rei: number | null;
  notes: string | null;
}

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="bg-white border-[1.5px] border-rule rounded-[10px] overflow-hidden break-inside-avoid">
      <div className="px-5 py-3 border-b border-rule flex items-baseline justify-between">
        <h2 className="font-serif text-base text-green-dark">{title}</h2>
        {count != null && <span className="text-[11px] font-mono text-mist">{count}</span>}
      </div>
      <div className="px-5 py-3 text-sm">{children}</div>
    </section>
  );
}
const Empty = ({ text }: { text: string }) => <div className="text-xs text-mist">{text}</div>;

export default function DailyLogPage() {
  const [courseId, setCourseId] = useState<string | null>(null);
  const [courseName, setCourseName] = useState("");
  const [canEdit, setCanEdit] = useState(false);
  const [date, setDate] = useState(todayLocal());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [weather, setWeather] = useState<Weather | null>(null);
  const [stats, setStats] = useState<{ gdd: number | null; rain: number | null; disease: string[] }>({
    gdd: null,
    rain: null,
    disease: [],
  });
  const [crew, setCrew] = useState<{ name: string; inAt: string; outAt: string | null; hours: number | null; notes: string | null }[]>([]);
  const [timeOff, setTimeOff] = useState<string[]>([]);
  const [events, setEvents] = useState<string[]>([]);
  const [tasks, setTasks] = useState<(Task & { who: string })[]>([]);
  const [apps, setApps] = useState<AppRow[]>([]);
  const [irrigation, setIrrigation] = useState<{ gallons: number; minutes: number | null; notes: string | null }[]>([]);
  const [maintenance, setMaintenance] = useState<{ equipment: string; task: string; hours: number | null; notes: string | null }[]>([]);
  const [mapNotes, setMapNotes] = useState<{ category: string; note: string }[]>([]);
  const [note, setNote] = useState("");
  const [savedNote, setSavedNote] = useState("");
  const [memberId, setMemberId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [noteMsg, setNoteMsg] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const context = await resolveCourseIdClient(supabase);
      if (!context) {
        setLoading(false);
        return;
      }
      setCourseId(context.courseId);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const [{ data: course }, { data: member }] = await Promise.all([
        supabase.from("courses").select("name").eq("id", context.courseId).single(),
        user && !context.isAdminView
          ? supabase.from("course_members").select("id, role").eq("user_id", user.id).eq("course_id", context.courseId).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      setCourseName(course?.name ?? "");
      setMemberId(member?.id ?? null);
      // Admin View can attempt a save; the browser client reports "view-only" if still locked.
      setCanEdit(context.isAdminView || ["owner", "superintendent", "assistant"].includes(member?.role ?? ""));
    }
    init();
  }, []);

  useEffect(() => {
    if (!courseId) return;
    let cancelled = false;
    async function load() {
    const supabase = createClient();
    const start = parseIso(date);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const s = start.toISOString();
    const e = end.toISOString();

    const [
      emp, entries, tasksSched, tasksDone, fert, pest, prods, irr, maint, cal, mapn, gdd, rain, dis, noteRow,
    ] = await Promise.all([
      supabase.from("employees").select("id, name").eq("course_id", courseId),
      supabase.from("time_entries").select("employee_id, clock_in, clock_out, notes").eq("course_id", courseId).gte("clock_in", s).lt("clock_in", e).order("clock_in"),
      supabase.from("task_assignments").select("id, name, icon, assigned_to, scheduled_date, status, started_at, completed_at, paused_minutes, actual_minutes_override, notes").eq("course_id", courseId).eq("scheduled_date", date),
      supabase.from("task_assignments").select("id, name, icon, assigned_to, scheduled_date, status, started_at, completed_at, paused_minutes, actual_minutes_override, notes").eq("course_id", courseId).gte("completed_at", s).lt("completed_at", e),
      supabase.from("fertilizer_applications").select("id, zone, product, product_id, n_lbs_per_1000, quantity_used, area_sqft, notes").eq("course_id", courseId).eq("application_date", date),
      supabase.from("pest_applications").select("id, area, target, category, product, product_id, rei_hours, quantity_used, area_sqft, notes").eq("course_id", courseId).gte("applied_at", s).lt("applied_at", e),
      supabase.from("products").select("id, unit").eq("course_id", courseId),
      supabase.from("irrigation_logs").select("gallons, duration_minutes, notes").eq("course_id", courseId).eq("cycle_date", date),
      supabase.from("maintenance_log").select("task, hours_at_service, notes, equipment(name)").eq("performed_at", date),
      supabase.from("calendar_events").select("event_type, title, employee_id").eq("course_id", courseId).lte("start_date", date).gte("end_date", date),
      supabase.from("course_map_notes").select("category, note").eq("course_id", courseId).gte("created_at", s).lt("created_at", e),
      supabase.from("gdd_daily_log").select("gdd").eq("course_id", courseId).eq("log_date", date).maybeSingle(),
      supabase.from("rainfall_daily_log").select("rainfall_in").eq("course_id", courseId).eq("log_date", date).maybeSingle(),
      supabase.from("disease_risk_daily_log").select("dollar_spot_pct, dollar_spot_above_threshold, pythium_elevated, brown_patch_elevated, anthracnose_above_threshold, fusarium_elevated").eq("course_id", courseId).eq("log_date", date).maybeSingle(),
      supabase.from("daily_log_notes").select("note").eq("course_id", courseId).eq("log_date", date).maybeSingle(),
    ]);

    if (cancelled) return;
    const firstError = [emp, entries, tasksSched, tasksDone, fert, pest, irr, maint, cal, mapn].find((r) => r.error);
    if (firstError?.error) setError(firstError.error.message);

    const names = new Map((emp.data ?? []).map((x) => [x.id as string, x.name as string]));
    const unit = new Map((prods.data ?? []).map((x) => [x.id as string, x.unit as string]));

    setCrew(
      (entries.data ?? []).map((x) => ({
        name: names.get(x.employee_id as string) ?? "Employee",
        inAt: x.clock_in as string,
        outAt: x.clock_out as string | null,
        hours: x.clock_out ? (new Date(x.clock_out as string).getTime() - new Date(x.clock_in as string).getTime()) / 3600000 : null,
        notes: x.notes as string | null,
      }))
    );
    setTimeOff((cal.data ?? []).filter((x) => x.event_type === "time_off").map((x) => `${names.get(x.employee_id as string) ?? "Employee"} — ${x.title}`));
    setEvents((cal.data ?? []).filter((x) => x.event_type === "special_event").map((x) => x.title as string));

    const merged = new Map<string, Task>();
    for (const t of [...(tasksSched.data ?? []), ...(tasksDone.data ?? [])]) merged.set(t.id as string, t as Task);
    setTasks([...merged.values()].map((t) => ({ ...t, who: t.assigned_to ? names.get(t.assigned_to) ?? "Employee" : "Unassigned" })));

    const qty = (q: number | null, u: string | undefined) => (q != null ? `${Number(q)}${u ? ` ${u}` : ""}` : "");
    const rows: AppRow[] = [
      ...(fert.data ?? []).map((a) => ({
        key: `f${a.id}`,
        kind: "Fertilizer",
        area: a.zone as string,
        product: a.product as string,
        detail: [Number(a.n_lbs_per_1000) ? `${Number(a.n_lbs_per_1000)} lb N/M` : "", qty(a.quantity_used as number | null, unit.get(a.product_id as string))].filter(Boolean).join(" · "),
        rei: null,
        notes: a.notes as string | null,
      })),
      ...(pest.data ?? []).map((a) => ({
        key: `p${a.id}`,
        kind: a.category ? CATEGORY_LABEL[a.category as ProductCategory] ?? "Application" : "Application",
        area: (a.area as string | null) ?? "—",
        product: a.product as string,
        detail: [a.target ? `Target: ${a.target}` : "", qty(a.quantity_used as number | null, unit.get(a.product_id as string))].filter(Boolean).join(" · "),
        rei: a.rei_hours as number | null,
        notes: a.notes as string | null,
      })),
    ];
    setApps(rows);

    setIrrigation((irr.data ?? []).map((x) => ({ gallons: Number(x.gallons), minutes: x.duration_minutes as number | null, notes: x.notes as string | null })));
    setMaintenance(
      (maint.data ?? []).map((x) => ({
        equipment: (x.equipment as unknown as { name: string } | null)?.name ?? "Equipment",
        task: x.task as string,
        hours: x.hours_at_service as number | null,
        notes: x.notes as string | null,
      }))
    );
    setMapNotes((mapn.data ?? []).map((x) => ({ category: x.category as string, note: x.note as string })));

    const d = dis.data;
    const flags: string[] = [];
    if (d) {
      flags.push(`Dollar spot ${Number(d.dollar_spot_pct).toFixed(0)}%${d.dollar_spot_above_threshold ? " (above threshold)" : ""}`);
      if (d.pythium_elevated) flags.push("Pythium elevated");
      if (d.brown_patch_elevated) flags.push("Brown patch elevated");
      if (d.anthracnose_above_threshold) flags.push("Anthracnose above threshold");
      if (d.fusarium_elevated) flags.push("Fusarium elevated");
    }
    setStats({
      gdd: gdd.data ? Number(gdd.data.gdd) : null,
      rain: rain.data ? Number(rain.data.rainfall_in) : null,
      disease: flags,
    });

    const n = (noteRow.data?.note as string | undefined) ?? "";
    setNote(n);
    setSavedNote(n);
    setNoteMsg(null);
    setLoading(false);

    try {
      const res = await fetch(`/api/daily-log/weather?date=${date}`);
      const w = res.ok ? await res.json() : { available: false, reason: "provider_error" };
      if (!cancelled) setWeather(w);
    } catch {
      if (!cancelled) setWeather({ available: false, reason: "provider_error" });
    }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [courseId, date]);

  // Reset happens here, on the user's action, rather than inside the loading effect.
  function changeDate(next: string) {
    setDate(next);
    setLoading(true);
    setError(null);
    setWeather(null);
  }

  async function saveNote() {
    if (!courseId) return;
    setSaving(true);
    setNoteMsg(null);
    const supabase = createClient();
    const trimmed = note.trim();
    const { error: err } = trimmed
      ? await supabase
          .from("daily_log_notes")
          .upsert(
            { course_id: courseId, log_date: date, note: trimmed, updated_by: memberId, updated_at: new Date().toISOString() },
            { onConflict: "course_id,log_date" }
          )
      : await supabase.from("daily_log_notes").delete().eq("course_id", courseId).eq("log_date", date);
    if (err) setNoteMsg(err.message);
    else {
      setSavedNote(trimmed);
      setNote(trimmed);
      setNoteMsg("Saved");
    }
    setSaving(false);
  }

  const isToday = date === todayLocal();
  const wx = weather;
  const rainValue = stats.rain ?? (wx?.available ? wx.precipIn ?? null : null);

  return (
    <div className="daily-log-root flex flex-col gap-4 max-w-4xl w-full mx-auto">
      <style>{`@media print {
        body:has(.daily-log-root) .h-screen { height: auto !important; overflow: visible !important; }
        body:has(.daily-log-root) main { overflow: visible !important; }
        body:has(.daily-log-root) header, body:has(.daily-log-root) .fixed, body:has(.daily-log-root) .bg-amber-500 { display: none !important; }
      }`}</style>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-green-forest mb-1">Daily Log</div>
          <div className="font-serif text-2xl text-green-dark">{dayName(parseIso(date))}</div>
          <div className="text-xs text-mist">{courseName}</div>
        </div>
        <div className="flex items-center gap-1.5 print:hidden">
          <button onClick={() => changeDate(shift(date, -1))} className="px-2.5 py-1.5 border-[1.5px] border-rule rounded-lg text-sm hover:border-green-mid" aria-label="Previous day">‹</button>
          <input
            type="date"
            value={date}
            max={todayLocal()}
            onChange={(ev) => ev.target.value && changeDate(ev.target.value)}
            className="px-2.5 py-1.5 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid"
          />
          <button onClick={() => changeDate(shift(date, 1))} disabled={isToday} className="px-2.5 py-1.5 border-[1.5px] border-rule rounded-lg text-sm hover:border-green-mid disabled:opacity-40" aria-label="Next day">›</button>
          {!isToday && (
            <button onClick={() => changeDate(todayLocal())} className="px-2.5 py-1.5 text-xs font-semibold text-green-mid hover:text-green-dark">Today</button>
          )}
          <button onClick={() => window.print()} className="px-3 py-1.5 bg-green-mid text-white text-xs font-semibold rounded-lg hover:bg-green-dark transition-colors">Print / Save PDF</button>
        </div>
      </div>

      {error && <div className="bg-red/5 border-[1.5px] border-red/40 rounded-lg px-4 py-2 text-xs text-red">Some of this day couldn&apos;t load: {error}</div>}
      {loading && <div className="text-xs text-mist">Loading…</div>}

      <Section title="Weather">
        {wx === null ? (
          <Empty text="Loading weather…" />
        ) : wx.available ? (
          <div className="flex flex-wrap gap-x-8 gap-y-2">
            <div><span className="text-mist text-xs">High / Low</span><div className="font-semibold">{wx.highF}° / {wx.lowF ?? "—"}°F</div></div>
            <div><span className="text-mist text-xs">Conditions</span><div className="font-semibold">{wx.conditions ?? "—"}</div></div>
            <div><span className="text-mist text-xs">Rain</span><div className="font-semibold">{rainValue != null ? `${rainValue.toFixed(2)} in` : "—"}</div></div>
            <div><span className="text-mist text-xs">Peak wind</span><div className="font-semibold">{wx.windMaxMph != null ? `${wx.windMaxMph} mph` : "—"}</div></div>
            <div><span className="text-mist text-xs">GDD (base 50°F)</span><div className="font-semibold">{stats.gdd != null ? stats.gdd.toFixed(1) : "—"}</div></div>
          </div>
        ) : (
          <Empty
            text={
              wx.reason === "no_location"
                ? "Add your street address in Course Setup to see weather here."
                : wx.reason === "future"
                ? "This day hasn't happened yet."
                : "Weather for this day isn't available right now."
            }
          />
        )}
        {stats.disease.length > 0 && <div className="mt-2 text-xs text-mist">Disease models: {stats.disease.join(" · ")}</div>}
      </Section>

      <Section title="Superintendent's Notes">
        {canEdit ? (
          <div className="flex flex-col gap-2">
            <textarea
              value={note}
              onChange={(ev) => setNote(ev.target.value)}
              rows={5}
              placeholder="What happened on the course today? Conditions, problems, decisions, anything worth remembering."
              className="w-full px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid print:hidden"
            />
            <div className="hidden print:block whitespace-pre-wrap">{note || "—"}</div>
            <div className="flex items-center gap-3 print:hidden">
              <button
                onClick={saveNote}
                disabled={saving || note.trim() === savedNote}
                className="px-3.5 py-1.5 bg-green-mid text-white text-xs font-semibold rounded-lg hover:bg-green-dark transition-colors disabled:opacity-40"
              >
                {saving ? "Saving…" : "Save note"}
              </button>
              {noteMsg && <span className={`text-xs ${noteMsg === "Saved" ? "text-green-dark" : "text-red"}`}>{noteMsg}</span>}
            </div>
          </div>
        ) : savedNote ? (
          <div className="whitespace-pre-wrap">{savedNote}</div>
        ) : (
          <Empty text="No note for this day." />
        )}
      </Section>

      <Section title="Crew" count={crew.length}>
        {crew.length === 0 ? (
          <Empty text="No one clocked in this day." />
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {crew.map((c, i) => (
                <tr key={i} className="border-b border-rule/60 last:border-0">
                  <td className="py-1.5 font-medium">{c.name}</td>
                  <td className="py-1.5 text-mist">{time(c.inAt)} – {c.outAt ? time(c.outAt) : "still clocked in"}</td>
                  <td className="py-1.5 text-right font-mono text-xs">{c.hours != null ? `${c.hours.toFixed(1)} h` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {timeOff.length > 0 && <div className="mt-2 text-xs text-mist">Time off: {timeOff.join("; ")}</div>}
        {events.length > 0 && <div className="mt-1 text-xs text-mist">Special events: {events.join("; ")}</div>}
      </Section>

      <Section title="Tasks" count={tasks.length}>
        {tasks.length === 0 ? (
          <Empty text="No tasks scheduled or completed this day." />
        ) : (
          <ul className="flex flex-col">
            {tasks.map((t) => {
              const mins = actualMinutesFor(t);
              return (
                <li key={t.id} className="py-1.5 border-b border-rule/60 last:border-0">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <span className="font-medium">{t.icon ? `${t.icon} ` : ""}{t.name}</span>
                    <span className="text-xs text-mist">{t.who}</span>
                    <span className="text-xs text-mist ml-auto">
                      {t.status === "complete" ? `Done ${time(t.completed_at)}${mins != null ? ` · ${formatMinutes(mins)}` : ""}` : t.status === "in_progress" ? "In progress" : "Not started"}
                    </span>
                  </div>
                  {t.notes && <div className="text-xs text-mist mt-0.5">{t.notes}</div>}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Fertilizer, Spray & Other Applications" count={apps.length}>
        {apps.length === 0 ? (
          <Empty text="No applications logged this day." />
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {apps.map((a) => (
                <tr key={a.key} className="border-b border-rule/60 last:border-0 align-top">
                  <td className="py-1.5 pr-3 font-medium">{a.area}</td>
                  <td className="py-1.5 pr-3">
                    {a.product}
                    <div className="text-xs text-mist">{[a.kind, a.detail].filter(Boolean).join(" · ")}</div>
                    {a.notes && <div className="text-xs text-mist">{a.notes}</div>}
                  </td>
                  <td className="py-1.5 text-right text-xs text-mist whitespace-nowrap">{a.rei ? `REI ${a.rei} hr` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="Irrigation" count={irrigation.length}>
        {irrigation.length === 0 ? (
          <Empty text="No irrigation logged this day." />
        ) : (
          <ul>
            {irrigation.map((x, i) => (
              <li key={i} className="py-1">{x.gallons.toLocaleString()} gal{x.minutes ? ` · ${x.minutes} min` : ""}{x.notes ? ` — ${x.notes}` : ""}</li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Equipment Work" count={maintenance.length}>
        {maintenance.length === 0 ? (
          <Empty text="No equipment service logged this day." />
        ) : (
          <ul>
            {maintenance.map((x, i) => (
              <li key={i} className="py-1">
                <span className="font-medium">{x.equipment}</span> — {x.task}
                {x.hours != null ? <span className="text-mist"> · {x.hours} hrs</span> : null}
                {x.notes ? <span className="text-xs text-mist"> · {x.notes}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {mapNotes.length > 0 && (
        <Section title="Course Map Notes" count={mapNotes.length}>
          <ul>
            {mapNotes.map((x, i) => (
              <li key={i} className="py-1"><span className="text-xs font-mono uppercase text-mist mr-2">{x.category.replace("_", " ")}</span>{x.note}</li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
