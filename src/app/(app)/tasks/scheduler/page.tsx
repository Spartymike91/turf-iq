"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { resolveCourseIdClient } from "@/lib/supabase/course-context";

interface TaskTemplate {
  id: string;
  name: string;
  category: string;
  estimated_duration: string | null;
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
  priority: "low" | "normal" | "high";
  status: "not_started" | "in_progress" | "complete";
  estimated_minutes: number | null;
  notes: string | null;
}

const todayStr = () => new Date().toISOString().slice(0, 10);
const emptyForm = { template_id: "", name: "", assigned_to: "", scheduled_date: todayStr(), priority: "normal", notes: "" };

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
        supabase.from("task_templates").select("id, name, category, estimated_duration").eq("course_id", context.courseId).order("name"),
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
        priority: addForm.priority,
        estimated_minutes: template?.estimated_duration ? parseInt(template.estimated_duration) || null : null,
        notes: addForm.notes || null,
      })
      .select()
      .single();

    if (insertError) {
      setError(insertError.message);
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
    if (!deleteError) setAssignments((prev) => prev.filter((a) => a.id !== id));
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

      <div className="bg-white border-[1.5px] border-rule rounded-[10px] overflow-hidden">
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
              <label className="text-[11px] font-semibold uppercase tracking-wide">Priority</label>
              <select
                value={addForm.priority}
                onChange={(e) => setAddForm({ ...addForm, priority: e.target.value })}
                className="px-2 py-2 border-[1.5px] border-rule rounded-lg text-sm"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
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
          </form>
        )}

        {filtered.length === 0 ? (
          <div className="p-10 text-center">
            <div className="text-4xl mb-3">🗓️</div>
            <div className="text-sm text-mist">No tasks scheduled for {dateFilter}.</div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-mono uppercase tracking-wider text-mist border-b border-rule">
                <th className="text-left px-5 py-2.5 font-medium">Task</th>
                <th className="text-left px-3 py-2.5 font-medium">Assigned To</th>
                <th className="text-left px-3 py-2.5 font-medium">Priority</th>
                <th className="text-left px-3 py-2.5 font-medium">Status</th>
                <th className="text-right px-5 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} className="border-b border-rule last:border-0">
                  <td className="px-5 py-2.5 font-medium">{a.name}</td>
                  <td className="px-3 py-2.5 text-mist">{employees.find((e) => e.id === a.assigned_to)?.name ?? "Unassigned"}</td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded font-mono ${
                        a.priority === "high" ? "bg-red/10 text-red" : a.priority === "low" ? "bg-blue/10 text-blue" : "bg-green-pale text-green-mid"
                      }`}
                    >
                      {a.priority.toUpperCase()}
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
        )}
      </div>
    </>
  );
}
