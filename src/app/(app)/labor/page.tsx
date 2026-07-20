"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { resolveCourseIdClient } from "@/lib/supabase/course-context";
import StatChip from "@/components/ui/StatChip";

type EmployeeType = "FT" | "PT" | "SEA";

interface Employee {
  id: string;
  course_id: string;
  name: string;
  initials: string;
  role: string;
  type: EmployeeType;
  hourly_rate: number;
  color: string;
  is_active: boolean;
}

const TYPE_LABELS: Record<EmployeeType, string> = {
  FT: "Full-Time",
  PT: "Part-Time",
  SEA: "Seasonal",
};

const AVATAR_COLORS = [
  "#3b5bdb",
  "#0891b2",
  "#2d6a4f",
  "#f59e0b",
  "#7c3aed",
  "#dc2626",
];

function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

const emptyForm = { name: "", role: "", type: "FT" as EmployeeType, hourly_rate: "" };

export default function LaborPage() {
  const [courseId, setCourseId] = useState<string | null>(null);
  const [courseName, setCourseName] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [checking, setChecking] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);

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
        .select("name")
        .eq("id", context.courseId)
        .single();
      setCourseName(course?.name ?? "");

      const { data: staff } = await supabase
        .from("employees")
        .select("*")
        .eq("course_id", context.courseId)
        .order("name");

      setEmployees(staff ?? []);
      setChecking(false);
    }
    load();
  }, []);

  const stats = useMemo(() => {
    const active = employees.filter((e) => e.is_active);
    const byType = (t: EmployeeType) => active.filter((e) => e.type === t).length;
    const avgRate =
      active.length > 0
        ? active.reduce((sum, e) => sum + Number(e.hourly_rate), 0) / active.length
        : 0;
    return {
      active: active.length,
      fullTime: byType("FT"),
      partTime: byType("PT"),
      seasonal: byType("SEA"),
      avgRate,
    };
  }, [employees]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!courseId || !addForm.name || !addForm.role || !addForm.hourly_rate) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("employees")
      .insert({
        course_id: courseId,
        name: addForm.name,
        initials: initialsFor(addForm.name),
        role: addForm.role,
        type: addForm.type,
        hourly_rate: parseFloat(addForm.hourly_rate),
        color: AVATAR_COLORS[employees.length % AVATAR_COLORS.length],
      })
      .select()
      .single();

    if (insertError) {
      setError(insertError.message);
    } else if (data) {
      setEmployees((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setAddForm(emptyForm);
      setShowAddForm(false);
    }
    setSaving(false);
  }

  function startEdit(emp: Employee) {
    setEditingId(emp.id);
    setEditForm({
      name: emp.name,
      role: emp.role,
      type: emp.type,
      hourly_rate: String(emp.hourly_rate),
    });
  }

  async function handleSaveEdit(id: string) {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { data, error: updateError } = await supabase
      .from("employees")
      .update({
        name: editForm.name,
        initials: initialsFor(editForm.name),
        role: editForm.role,
        type: editForm.type,
        hourly_rate: parseFloat(editForm.hourly_rate),
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      setError(updateError.message);
    } else if (data) {
      setEmployees((prev) =>
        prev.map((e) => (e.id === id ? data : e)).sort((a, b) => a.name.localeCompare(b.name))
      );
      setEditingId(null);
    }
    setSaving(false);
  }

  async function toggleActive(emp: Employee) {
    const supabase = createClient();
    const { data } = await supabase
      .from("employees")
      .update({ is_active: !emp.is_active })
      .eq("id", emp.id)
      .select()
      .single();
    if (data) {
      setEmployees((prev) => prev.map((e) => (e.id === emp.id ? data : e)));
    }
  }

  async function handleDelete(id: string) {
    const supabase = createClient();
    const { error: deleteError } = await supabase.from("employees").delete().eq("id", id);
    if (!deleteError) {
      setEmployees((prev) => prev.filter((e) => e.id !== id));
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
        <div className="text-sm text-mist">Set up your course profile before adding staff.</div>
      </div>
    );
  }

  return (
    <>
      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-green-forest mb-1">
          Labor & Staffing
        </div>
        <div className="font-serif text-2xl text-green-dark">Crew Roster</div>
        <div className="text-[13px] text-mist mt-1">
          {courseName} · {stats.active} active staff
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <StatChip label="Active Staff" value={String(stats.active)} sub={`${employees.length} total on roster`} tag="Roster" tagColor="ok" />
        <StatChip label="Full-Time" value={String(stats.fullTime)} sub="FT positions" valueColor="#3b5bdb" />
        <StatChip label="Part-Time / Seasonal" value={String(stats.partTime + stats.seasonal)} sub={`${stats.partTime} PT · ${stats.seasonal} seasonal`} />
        <StatChip label="Avg. Hourly Rate" value={`$${stats.avgRate.toFixed(2)}`} sub="Across active staff" />
      </div>

      <div className="bg-white border-[1.5px] border-rule rounded-[10px] overflow-hidden shrink-0">
        <div className="flex items-center justify-between px-5 py-4 border-b-[1.5px] border-rule">
          <div className="font-serif text-lg text-green-dark">Staff Roster</div>
          <button
            onClick={() => setShowAddForm((v) => !v)}
            className="px-3.5 py-1.5 bg-green-mid text-white text-xs font-semibold rounded-lg hover:bg-green-dark transition-colors"
          >
            {showAddForm ? "Cancel" : "+ Add Employee"}
          </button>
        </div>

        {showAddForm && (
          <form
            onSubmit={handleAdd}
            className="flex flex-wrap items-end gap-3 px-5 py-4 border-b-[1.5px] border-rule bg-chalk"
          >
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide">Name</label>
              <input
                type="text"
                required
                value={addForm.name}
                onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                placeholder="Jordan Reyes"
                className="px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid focus:ring-2 focus:ring-green-mid/10"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide">Role</label>
              <input
                type="text"
                required
                value={addForm.role}
                onChange={(e) => setAddForm({ ...addForm, role: e.target.value })}
                placeholder="Equipment Operator"
                className="px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid focus:ring-2 focus:ring-green-mid/10"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide">Type</label>
              <select
                value={addForm.type}
                onChange={(e) => setAddForm({ ...addForm, type: e.target.value as EmployeeType })}
                className="px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid"
              >
                <option value="FT">Full-Time</option>
                <option value="PT">Part-Time</option>
                <option value="SEA">Seasonal</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide">Hourly Rate</label>
              <input
                type="number"
                step="0.01"
                required
                value={addForm.hourly_rate}
                onChange={(e) => setAddForm({ ...addForm, hourly_rate: e.target.value })}
                placeholder="18.50"
                className="w-28 px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid focus:ring-2 focus:ring-green-mid/10"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-green-mid text-white text-sm font-semibold rounded-lg hover:bg-green-dark transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </form>
        )}

        {error && <div className="px-5 py-2 text-xs text-red bg-red/5">{error}</div>}

        {employees.length === 0 ? (
          <div className="p-10 text-center">
            <div className="text-4xl mb-3">👷</div>
            <div className="text-sm text-mist">No staff on the roster yet. Add your first employee above.</div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-mono uppercase tracking-wider text-mist border-b border-rule">
                <th className="text-left px-5 py-2.5 font-medium">Employee</th>
                <th className="text-left px-3 py-2.5 font-medium">Role</th>
                <th className="text-left px-3 py-2.5 font-medium">Type</th>
                <th className="text-left px-3 py-2.5 font-medium">Rate</th>
                <th className="text-left px-3 py-2.5 font-medium">Status</th>
                <th className="text-right px-5 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => (
                <tr key={emp.id} className="border-b border-rule last:border-0">
                  {editingId === emp.id ? (
                    <>
                      <td className="px-5 py-2.5">
                        <input
                          value={editForm.name}
                          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          className="px-2 py-1 border-[1.5px] border-rule rounded text-sm w-full outline-none focus:border-green-mid"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <input
                          value={editForm.role}
                          onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                          className="px-2 py-1 border-[1.5px] border-rule rounded text-sm w-full outline-none focus:border-green-mid"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <select
                          value={editForm.type}
                          onChange={(e) =>
                            setEditForm({ ...editForm, type: e.target.value as EmployeeType })
                          }
                          className="px-2 py-1 border-[1.5px] border-rule rounded text-sm outline-none focus:border-green-mid"
                        >
                          <option value="FT">Full-Time</option>
                          <option value="PT">Part-Time</option>
                          <option value="SEA">Seasonal</option>
                        </select>
                      </td>
                      <td className="px-3 py-2.5">
                        <input
                          type="number"
                          step="0.01"
                          value={editForm.hourly_rate}
                          onChange={(e) => setEditForm({ ...editForm, hourly_rate: e.target.value })}
                          className="px-2 py-1 border-[1.5px] border-rule rounded text-sm w-20 outline-none focus:border-green-mid"
                        />
                      </td>
                      <td className="px-3 py-2.5" />
                      <td className="px-5 py-2.5 text-right whitespace-nowrap">
                        <button
                          onClick={() => handleSaveEdit(emp.id)}
                          disabled={saving}
                          className="text-green-mid text-xs font-semibold hover:text-green-dark mr-3"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-mist text-xs font-semibold hover:text-ink"
                        >
                          Cancel
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-semibold shrink-0"
                            style={{ backgroundColor: emp.color }}
                          >
                            {emp.initials}
                          </div>
                          <span className={emp.is_active ? "" : "text-mist line-through"}>
                            {emp.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-mist">{emp.role}</td>
                      <td className="px-3 py-2.5">
                        <span className="text-[10px] font-mono uppercase tracking-wide bg-green-pale text-green-mid px-1.5 py-0.5 rounded">
                          {TYPE_LABELS[emp.type]}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-mono">${Number(emp.hourly_rate).toFixed(2)}</td>
                      <td className="px-3 py-2.5">
                        <button
                          onClick={() => toggleActive(emp)}
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded font-mono ${
                            emp.is_active ? "bg-green-pale text-green-mid" : "bg-red/10 text-red"
                          }`}
                        >
                          {emp.is_active ? "ACTIVE" : "INACTIVE"}
                        </button>
                      </td>
                      <td className="px-5 py-2.5 text-right whitespace-nowrap">
                        <button
                          onClick={() => startEdit(emp)}
                          className="text-mist text-xs font-semibold hover:text-green-dark mr-3"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(emp.id)}
                          className="text-mist text-xs font-semibold hover:text-red"
                        >
                          Delete
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
