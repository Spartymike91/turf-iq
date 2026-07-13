"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { resolveCourseIdClient } from "@/lib/supabase/course-context";

interface TaskTemplate {
  id: string;
  course_id: string;
  category: string;
  icon: string | null;
  name: string;
  frequency: string | null;
  estimated_duration: string | null;
  equipment: string | null;
  materials: string | null;
  description: string | null;
}

const emptyForm = {
  category: "",
  icon: "",
  name: "",
  frequency: "",
  estimated_duration: "",
  equipment: "",
  materials: "",
  description: "",
};

export default function TaskLibraryPage() {
  const [courseId, setCourseId] = useState<string | null>(null);
  const [courseName, setCourseName] = useState("");
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);

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

      const { data } = await supabase
        .from("task_templates")
        .select("*")
        .eq("course_id", context.courseId)
        .order("category")
        .order("name");
      setTemplates(data ?? []);
      setChecking(false);
    }
    load();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!courseId || !addForm.category || !addForm.name) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("task_templates")
      .insert({ course_id: courseId, ...addForm })
      .select()
      .single();
    if (insertError) {
      setError(insertError.message);
    } else if (data) {
      setTemplates((prev) => [...prev, data].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)));
      setAddForm(emptyForm);
      setShowAdd(false);
    }
    setSaving(false);
  }

  function startEdit(t: TaskTemplate) {
    setEditingId(t.id);
    setEditForm({
      category: t.category,
      icon: t.icon ?? "",
      name: t.name,
      frequency: t.frequency ?? "",
      estimated_duration: t.estimated_duration ?? "",
      equipment: t.equipment ?? "",
      materials: t.materials ?? "",
      description: t.description ?? "",
    });
  }

  async function handleSaveEdit(id: string) {
    setSaving(true);
    const supabase = createClient();
    const { data, error: updateError } = await supabase
      .from("task_templates")
      .update(editForm)
      .eq("id", id)
      .select()
      .single();
    if (!updateError && data) {
      setTemplates((prev) => prev.map((t) => (t.id === id ? data : t)));
      setEditingId(null);
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    const supabase = createClient();
    const { error: deleteError } = await supabase.from("task_templates").delete().eq("id", id);
    if (!deleteError) setTemplates((prev) => prev.filter((t) => t.id !== id));
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
        <div className="text-sm text-mist">Set up your course profile before building a task library.</div>
      </div>
    );
  }

  return (
    <>
      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-green-forest mb-1">Task Library</div>
        <div className="font-serif text-2xl text-green-dark">Reusable Task Templates</div>
        <div className="text-[13px] text-mist mt-1">
          {courseName} · {templates.length} templates
        </div>
      </div>

      {error && (
        <div className="bg-red/5 border-[1.5px] border-red/40 rounded-lg px-4 py-2 text-xs text-red">{error}</div>
      )}

      <div className="bg-white border-[1.5px] border-rule rounded-[10px] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b-[1.5px] border-rule">
          <div className="font-serif text-lg text-green-dark">Templates</div>
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="px-3.5 py-1.5 bg-green-mid text-white text-xs font-semibold rounded-lg hover:bg-green-dark transition-colors"
          >
            {showAdd ? "Cancel" : "+ Add Template"}
          </button>
        </div>

        {showAdd && (
          <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-2 px-5 py-4 border-b-[1.5px] border-rule bg-chalk">
            <input required value={addForm.icon} onChange={(e) => setAddForm({ ...addForm, icon: e.target.value })} placeholder="🌱" className="w-12 px-2 py-2 border-[1.5px] border-rule rounded-lg text-sm text-center" />
            <input required value={addForm.category} onChange={(e) => setAddForm({ ...addForm, category: e.target.value })} placeholder="Mowing" className="w-28 px-2 py-2 border-[1.5px] border-rule rounded-lg text-sm" />
            <input required value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} placeholder="Mow greens" className="w-36 px-2 py-2 border-[1.5px] border-rule rounded-lg text-sm" />
            <input value={addForm.frequency} onChange={(e) => setAddForm({ ...addForm, frequency: e.target.value })} placeholder="Daily" className="w-24 px-2 py-2 border-[1.5px] border-rule rounded-lg text-sm" />
            <input value={addForm.estimated_duration} onChange={(e) => setAddForm({ ...addForm, estimated_duration: e.target.value })} placeholder="45 min" className="w-24 px-2 py-2 border-[1.5px] border-rule rounded-lg text-sm" />
            <input value={addForm.equipment} onChange={(e) => setAddForm({ ...addForm, equipment: e.target.value })} placeholder="Greens mower" className="w-32 px-2 py-2 border-[1.5px] border-rule rounded-lg text-sm" />
            <input value={addForm.materials} onChange={(e) => setAddForm({ ...addForm, materials: e.target.value })} placeholder="—" className="w-28 px-2 py-2 border-[1.5px] border-rule rounded-lg text-sm" />
            <input value={addForm.description} onChange={(e) => setAddForm({ ...addForm, description: e.target.value })} placeholder="Notes" className="flex-1 min-w-[120px] px-2 py-2 border-[1.5px] border-rule rounded-lg text-sm" />
            <button type="submit" disabled={saving} className="px-4 py-2 bg-green-mid text-white text-sm font-semibold rounded-lg hover:bg-green-dark transition-colors disabled:opacity-50">
              {saving ? "Saving..." : "Save"}
            </button>
          </form>
        )}

        {templates.length === 0 ? (
          <div className="p-10 text-center">
            <div className="text-4xl mb-3">📋</div>
            <div className="text-sm text-mist">No task templates yet. Add your first one above.</div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-mono uppercase tracking-wider text-mist border-b border-rule">
                <th className="text-left px-5 py-2.5 font-medium"></th>
                <th className="text-left px-3 py-2.5 font-medium">Category</th>
                <th className="text-left px-3 py-2.5 font-medium">Task</th>
                <th className="text-left px-3 py-2.5 font-medium">Frequency</th>
                <th className="text-left px-3 py-2.5 font-medium">Duration</th>
                <th className="text-left px-3 py-2.5 font-medium">Equipment</th>
                <th className="text-right px-5 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) =>
                editingId === t.id ? (
                  <tr key={t.id} className="border-b border-rule last:border-0">
                    <td className="px-5 py-2.5">
                      <input value={editForm.icon} onChange={(e) => setEditForm({ ...editForm, icon: e.target.value })} className="w-10 px-1 py-1 border-[1.5px] border-rule rounded text-sm text-center" />
                    </td>
                    <td className="px-3 py-2.5">
                      <input value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })} className="w-24 px-2 py-1 border-[1.5px] border-rule rounded text-sm" />
                    </td>
                    <td className="px-3 py-2.5">
                      <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="w-32 px-2 py-1 border-[1.5px] border-rule rounded text-sm" />
                    </td>
                    <td className="px-3 py-2.5">
                      <input value={editForm.frequency} onChange={(e) => setEditForm({ ...editForm, frequency: e.target.value })} className="w-20 px-2 py-1 border-[1.5px] border-rule rounded text-sm" />
                    </td>
                    <td className="px-3 py-2.5">
                      <input value={editForm.estimated_duration} onChange={(e) => setEditForm({ ...editForm, estimated_duration: e.target.value })} className="w-20 px-2 py-1 border-[1.5px] border-rule rounded text-sm" />
                    </td>
                    <td className="px-3 py-2.5">
                      <input value={editForm.equipment} onChange={(e) => setEditForm({ ...editForm, equipment: e.target.value })} className="w-28 px-2 py-1 border-[1.5px] border-rule rounded text-sm" />
                    </td>
                    <td className="px-5 py-2.5 text-right whitespace-nowrap">
                      <button onClick={() => handleSaveEdit(t.id)} className="text-green-mid text-xs font-semibold mr-2">Save</button>
                      <button onClick={() => setEditingId(null)} className="text-mist text-xs font-semibold">Cancel</button>
                    </td>
                  </tr>
                ) : (
                  <tr key={t.id} className="border-b border-rule last:border-0">
                    <td className="px-5 py-2.5 text-lg">{t.icon}</td>
                    <td className="px-3 py-2.5">
                      <span className="text-[10px] font-mono uppercase tracking-wide bg-green-pale text-green-mid px-1.5 py-0.5 rounded">{t.category}</span>
                    </td>
                    <td className="px-3 py-2.5 font-medium">{t.name}</td>
                    <td className="px-3 py-2.5 text-mist">{t.frequency || "—"}</td>
                    <td className="px-3 py-2.5 text-mist">{t.estimated_duration || "—"}</td>
                    <td className="px-3 py-2.5 text-mist">{t.equipment || "—"}</td>
                    <td className="px-5 py-2.5 text-right whitespace-nowrap">
                      <button onClick={() => startEdit(t)} className="text-mist text-xs font-semibold hover:text-green-dark mr-2">Edit</button>
                      <button onClick={() => handleDelete(t.id)} className="text-mist text-xs font-semibold hover:text-red">Delete</button>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
