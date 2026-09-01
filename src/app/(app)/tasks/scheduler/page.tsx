"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { resolveCourseIdClient } from "@/lib/supabase/course-context";
import { MOW_DIRECTIONS, type MowDirection } from "@/lib/mowDirections";
import MowDirectionIcon from "@/components/tasks/MowDirectionIcon";

interface TaskTemplate {
  id: string;
  name: string;
  category: string;
  estimated_duration: string | null;
  target_minutes: number | null;
}

interface Employee {
  id: string;
  name: string;
  is_active: boolean;
}

interface TaskAssignment {
  id: string;
  course_id: string;
  template_id: string | null;
  name: string;
  assigned_to: string | null;
  scheduled_date: string;
  priority: number;
  mow_direction: MowDirection | null;
  status: "not_started" | "in_progress" | "complete";
  estimated_minutes: number | null;
  started_at: string | null;
  completed_at: string | null;
  quality_rating: number | null;
  notes: string | null;
}

interface EmployeeStat {
  employeeId: string;
  name: string;
  avgMinutes: number | null;
  completions: number;
  avgQuality: number | null;
  qualityCount: number;
}

const todayStr = () => new Date().toISOString().slice(0, 10);
const emptyForm = { template_id: "", name: "", assigned_to: "", scheduled_date: todayStr(), priority: "1", mow_direction: "" as MowDirection | "", notes: "" };

export default function TaskSchedulerPage() {
  const [courseId, setCourseId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [assignments, setAssignments] = useState<TaskAssignment[]>([]);
  const [dateFilter, setDateFilter] = useState(todayStr());
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState(emptyForm);
  const [suggestMetric, setSuggestMetric] = useState<"speed" | "quality">("speed");

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const context = await resolveCourseIdClient(supabase);

      if (!context) {
        setChecking(false);
        return;
      }
      setCourseId(context.courseId);

      const [{ data: tpl }, { data: emp }, { data: assign }] = await Promise.all([
        supabase.from("task_templates").select("id, name, category, estimated_duration, target_minutes").eq("course_id", context.courseId).order("name"),
        supabase.from("employees").select("id, name, is_active").eq("course_id", context.courseId).eq("is_active", true).order("name"),
        supabase.from("task_assignments").select("*").eq("course_id", context.courseId).order("scheduled_date", { ascending: false }),
      ]);
      setTemplates(tpl ?? []);
      setEmployees(emp ?? []);
      setAssignments(assign ?? []);
      setChecking(false);
    }
    load();
  }, []);

  const filtered = assignments.filter((a) => a.scheduled_date === dateFilter);

  // Real history for this specific recurring task, per employee — the raw
  // averages are shown alongside their sample size deliberately (rather than
  // picking a single "best" employee) so a superintendent can judge whether
  // one completion at 5 stars is actually more trustworthy than eight
  // completions averaging 4.6. We don't try to adjust for that ourselves.
  const employeeStats: EmployeeStat[] = useMemo(() => {
    if (!addForm.template_id) return [];
    const byEmployee = new Map<string, { durations: number[]; qualities: number[] }>();
    for (const a of assignments) {
      if (a.template_id !== addForm.template_id || a.status !== "complete" || !a.assigned_to) continue;
      if (!byEmployee.has(a.assigned_to)) byEmployee.set(a.assigned_to, { durations: [], qualities: [] });
      const entry = byEmployee.get(a.assigned_to)!;
      if (a.started_at && a.completed_at) {
        entry.durations.push((new Date(a.completed_at).getTime() - new Date(a.started_at).getTime()) / 60000);
      }
      if (a.quality_rating != null) entry.qualities.push(a.quality_rating);
    }
    const stats: EmployeeStat[] = [];
    for (const [employeeId, { durations, qualities }] of byEmployee) {
      const employee = employees.find((e) => e.id === employeeId);
      if (!employee) continue; // inactive/deleted since — not assignable anyway
      stats.push({
        employeeId,
        name: employee.name,
        avgMinutes: durations.length ? durations.reduce((s, d) => s + d, 0) / durations.length : null,
        completions: durations.length,
        avgQuality: qualities.length ? qualities.reduce((s, q) => s + q, 0) / qualities.length : null,
        qualityCount: qualities.length,
      });
    }
    return stats.sort((a, b) => {
      if (suggestMetric === "speed") {
        if (a.avgMinutes == null) return 1;
        if (b.avgMinutes == null) return -1;
        return a.avgMinutes - b.avgMinutes;
      }
      if (a.avgQuality == null) return 1;
      if (b.avgQuality == null) return -1;
      return b.avgQuality - a.avgQuality;
    });
  }, [addForm.template_id, assignments, employees, suggestMetric]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!courseId) return;
    const template = templates.find((t) => t.id === addForm.template_id);
    const name = template ? template.name : addForm.name;
    if (!name) {
      setError("Pick a template or enter a task name.");
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("task_assignments")
      .insert({
        course_id: courseId,
        template_id: addForm.template_id || null,
        name,
        assigned_to: addForm.assigned_to || null,
        scheduled_date: addForm.scheduled_date,
        priority: Number(addForm.priority) || 1,
        mow_direction: addForm.mow_direction || null,
        estimated_minutes:
          template?.target_minutes ?? (template?.estimated_duration ? parseInt(template.estimated_duration) || null : null),
        notes: addForm.notes || null,
      })
      .select()
      .single();

    if (insertError) {
      setError(
        insertError.message.includes("row-level security policy")
          ? "You don't have permission to schedule tasks. Ask an owner, superintendent, or assistant for access."
          : insertError.message
      );
    } else if (data) {
      setAssignments((prev) => [data, ...prev]);
      setAddForm({ ...emptyForm, scheduled_date: addForm.scheduled_date });
      setShowAdd(false);
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    const supabase = createClient();
    const { error: deleteError } = await supabase.from("task_assignments").delete().eq("id", id);
    if (deleteError) {
      setError(
        deleteError.message.includes("row-level security policy")
          ? "You don't have permission to delete tasks. Ask an owner, superintendent, or assistant for access."
          : deleteError.message
      );
    } else {
      setAssignments((prev) => prev.filter((a) => a.id !== id));
    }
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
        <div className="text-sm text-mist">Set up your course profile before scheduling tasks.</div>
      </div>
    );
  }

  return (
    <>
      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-green-forest mb-1">Task Scheduler</div>
        <div className="font-serif text-2xl text-green-dark">Assign &amp; Schedule Tasks</div>
      </div>

      {error && (
        <div className="bg-red/5 border-[1.5px] border-red/40 rounded-lg px-4 py-2 text-xs text-red">{error}</div>
      )}

      <div className="bg-white border-[1.5px] border-rule rounded-[10px] overflow-hidden shrink-0">
        <div className="flex items-center justify-between px-5 py-4 border-b-[1.5px] border-rule flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="font-serif text-lg text-green-dark">Assignments</div>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="px-2 py-1.5 border-[1.5px] border-rule rounded-lg text-sm"
            />
          </div>
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="px-3.5 py-1.5 bg-green-mid text-white text-xs font-semibold rounded-lg hover:bg-green-dark transition-colors"
          >
            {showAdd ? "Cancel" : "+ Schedule Task"}
          </button>
        </div>

        {showAdd && (
          <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-2 px-5 py-4 border-b-[1.5px] border-rule bg-chalk">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide">Template</label>
              <select
                value={addForm.template_id}
                onChange={(e) => setAddForm({ ...addForm, template_id: e.target.value, name: "" })}
                className="w-40 px-2 py-2 border-[1.5px] border-rule rounded-lg text-sm"
              >
                <option value="">Ad-hoc (type below)</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.category} — {t.name}
                  </option>
                ))}
              </select>
            </div>
            {!addForm.template_id && (
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wide">Task Name</label>
                <input
                  value={addForm.name}
                  onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                  placeholder="Ad-hoc task"
                  className="w-36 px-2 py-2 border-[1.5px] border-rule rounded-lg text-sm"
                />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide">Assign To</label>
              <select
                value={addForm.assigned_to}
                onChange={(e) => setAddForm({ ...addForm, assigned_to: e.target.value })}
                className="w-36 px-2 py-2 border-[1.5px] border-rule rounded-lg text-sm"
              >
                <option value="">Unassigned</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide">Date</label>
              <input
                type="date"
                value={addForm.scheduled_date}
                onChange={(e) => setAddForm({ ...addForm, scheduled_date: e.target.value })}
                className="px-2 py-2 border-[1.5px] border-rule rounded-lg text-sm"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide">Task #</label>
              <input
                type="number"
                min="1"
                value={addForm.priority}
                onChange={(e) => setAddForm({ ...addForm, priority: e.target.value })}
                className="w-16 px-2 py-2 border-[1.5px] border-rule rounded-lg text-sm"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide">Mow Direction</label>
              <div className="flex gap-1 bg-white border-[1.5px] border-rule rounded-lg p-1">
                {MOW_DIRECTIONS.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    title={d.label}
                    onClick={() => setAddForm({ ...addForm, mow_direction: addForm.mow_direction === d.value ? "" : d.value })}
                    className={`p-1 rounded transition-colors ${
                      addForm.mow_direction === d.value ? "bg-green-pale text-green-mid" : "text-mist hover:text-ink"
                    }`}
                  >
                    <MowDirectionIcon direction={d.value} />
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1.5 flex-1 min-w-[120px]">
              <label className="text-[11px] font-semibold uppercase tracking-wide">Notes</label>
              <input
                value={addForm.notes}
                onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })}
                placeholder="Notes"
                className="px-2 py-2 border-[1.5px] border-rule rounded-lg text-sm w-full"
              />
            </div>
            <button type="submit" disabled={saving} className="px-4 py-2 bg-green-mid text-white text-sm font-semibold rounded-lg hover:bg-green-dark transition-colors disabled:opacity-50">
              {saving ? "Saving..." : "Save"}
            </button>

            {addForm.template_id && (
              <div className="w-full flex flex-col gap-2 pt-3 mt-1 border-t border-rule">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold uppercase tracking-wide">Suggest an employee</label>
                  <div className="flex gap-1 bg-white border-[1.5px] border-rule rounded-lg p-0.5">
                    {(["speed", "quality"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setSuggestMetric(m)}
                        className={`px-2.5 py-1 rounded text-[11px] font-semibold capitalize transition-colors ${
                          suggestMetric === m ? "bg-green-mid text-white" : "text-mist hover:text-ink"
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
                {employeeStats.length === 0 ? (
                  <div className="text-xs text-mist">
                    No completed history yet for this task — suggestions will appear once a few are done.
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {employeeStats.map((s, i) => (
                      <button
                        key={s.employeeId}
                        type="button"
                        onClick={() => setAddForm({ ...addForm, assigned_to: s.employeeId })}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border-[1.5px] transition-colors ${
                          addForm.assigned_to === s.employeeId
                            ? "bg-green-pale border-green-mid text-green-dark"
                            : "border-rule hover:border-green-mid"
                        }`}
                      >
                        {i === 0 && <span title={suggestMetric === "speed" ? "Fastest on record" : "Best quality on record"}>⭐</span>}
                        <span className="font-semibold">{s.name}</span>
                        <span className="text-mist font-mono">
                          {suggestMetric === "speed"
                            ? s.avgMinutes != null
                              ? `${Math.round(s.avgMinutes)} min avg`
                              : "no timed runs"
                            : s.avgQuality != null
                            ? `${s.avgQuality.toFixed(1)}★ avg`
                            : "no ratings"}
                        </span>
                        <span className="text-mist">
                          ({suggestMetric === "speed" ? s.completions : s.qualityCount}x)
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </form>
        )}

        {filtered.length === 0 ? (
          <div className="p-10 text-center">
            <div className="text-4xl mb-3">🗓️</div>
            <div className="text-sm text-mist">No tasks scheduled for {dateFilter}.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="text-[10px] font-mono uppercase tracking-wider text-mist border-b border-rule">
                <th className="text-left px-5 py-2.5 font-medium">Task</th>
                <th className="text-left px-3 py-2.5 font-medium">Assigned To</th>
                <th className="text-left px-3 py-2.5 font-medium">Task #</th>
                <th className="text-left px-3 py-2.5 font-medium">Status</th>
                <th className="text-right px-5 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} className="border-b border-rule last:border-0">
                  <td className="px-5 py-2.5 font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      {a.name}
                      <MowDirectionIcon direction={a.mow_direction} />
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-mist">{employees.find((e) => e.id === a.assigned_to)?.name ?? "Unassigned"}</td>
                  <td className="px-3 py-2.5">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded font-mono bg-green-pale text-green-mid">
                      TASK {a.priority}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-mist">{a.status.replace("_", " ")}</td>
                  <td className="px-5 py-2.5 text-right">
                    <button onClick={() => handleDelete(a.id)} className="text-mist text-xs font-semibold hover:text-red">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </>
  );
}
