"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { resolveCourseIdClient } from "@/lib/supabase/course-context";
import AlertBanner from "@/components/ui/AlertBanner";
import { getDueStatus } from "@/lib/equipmentModels";

interface Equipment {
  id: string;
  course_id: string;
  name: string;
  make: string | null;
  model: string | null;
  serial_number: string | null;
  current_hours: number;
  is_active: boolean;
  notes: string | null;
}

interface ScheduleItem {
  id: string;
  equipment_id: string;
  task: string;
  interval_hours: number | null;
  interval_days: number | null;
  source: "ai_suggested" | "manual" | "ai_suggested_edited";
  notes: string | null;
}

interface MaintenanceLogRow {
  id: string;
  equipment_id: string;
  task: string;
  performed_at: string;
  hours_at_service: number | null;
  cost: number | null;
  notes: string | null;
}

interface DraftItem {
  task: string;
  interval_hours: number | null;
  interval_days: number | null;
  notes: string;
}

const emptyEquipmentForm = { name: "", make: "", model: "", serial_number: "", current_hours: "" };
const emptyItemForm = { task: "", interval_hours: "", interval_days: "", notes: "" };
const emptyLogForm = { task: "", performed_at: "", hours_at_service: "", cost: "", notes: "" };

export default function EquipmentPage() {
  const [courseId, setCourseId] = useState<string | null>(null);
  const [courseName, setCourseName] = useState("");
  const [equipmentList, setEquipmentList] = useState<Equipment[]>([]);
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
  const [logs, setLogs] = useState<MaintenanceLogRow[]>([]);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [showAddEquipment, setShowAddEquipment] = useState(false);
  const [addEquipmentForm, setAddEquipmentForm] = useState(emptyEquipmentForm);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [showAddItem, setShowAddItem] = useState(false);
  const [addItemForm, setAddItemForm] = useState(emptyItemForm);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editItemForm, setEditItemForm] = useState(emptyItemForm);

  const [showAddLog, setShowAddLog] = useState(false);
  const [addLogForm, setAddLogForm] = useState(emptyLogForm);

  const [suggesting, setSuggesting] = useState(false);
  const [draftItems, setDraftItems] = useState<DraftItem[] | null>(null);
  const [editingHours, setEditingHours] = useState(false);
  const [hoursInput, setHoursInput] = useState("");

  async function loadFleetData(cId: string) {
    const supabase = createClient();
    const { data: eq } = await supabase
      .from("equipment")
      .select("*")
      .eq("course_id", cId)
      .order("name");
    const ids = (eq ?? []).map((e) => e.id);
    const [{ data: items }, { data: logRows }] = await Promise.all([
      ids.length
        ? supabase.from("maintenance_schedule_items").select("*").in("equipment_id", ids)
        : Promise.resolve({ data: [] }),
      ids.length
        ? supabase.from("maintenance_log").select("*").in("equipment_id", ids).order("performed_at", { ascending: false })
        : Promise.resolve({ data: [] }),
    ]);
    setEquipmentList(eq ?? []);
    setScheduleItems(items ?? []);
    setLogs(logRows ?? []);
  }

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

      await loadFleetData(context.courseId);
      setChecking(false);
    }
    load();
  }, []);

  const worstIssue = useMemo(() => {
    let worst: { equipment: Equipment; item: ScheduleItem; status: ReturnType<typeof getDueStatus> } | null = null;
    for (const item of scheduleItems) {
      const equipment = equipmentList.find((e) => e.id === item.equipment_id);
      if (!equipment || !equipment.is_active) continue;
      const status = getDueStatus(item, equipment, logs);
      if (status.status === "OK") continue;
      if (
        !worst ||
        (status.status === "OVERDUE" && worst.status.status !== "OVERDUE") ||
        (status.status === worst.status.status &&
          (status.hoursRemaining ?? status.daysRemaining ?? 0) < (worst.status.hoursRemaining ?? worst.status.daysRemaining ?? 0))
      ) {
        worst = { equipment, item, status };
      }
    }
    return worst;
  }, [scheduleItems, equipmentList, logs]);

  const selectedEquipment = equipmentList.find((e) => e.id === selectedId) ?? null;
  const selectedItems = scheduleItems.filter((i) => i.equipment_id === selectedId);
  const selectedLogs = logs.filter((l) => l.equipment_id === selectedId);

  async function handleAddEquipment(e: React.FormEvent) {
    e.preventDefault();
    if (!courseId || !addEquipmentForm.name) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("equipment")
      .insert({
        course_id: courseId,
        name: addEquipmentForm.name,
        make: addEquipmentForm.make || null,
        model: addEquipmentForm.model || null,
        serial_number: addEquipmentForm.serial_number || null,
        current_hours: addEquipmentForm.current_hours ? parseFloat(addEquipmentForm.current_hours) : 0,
      })
      .select()
      .single();

    if (insertError) {
      setError(insertError.message);
    } else if (data) {
      setEquipmentList((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setAddEquipmentForm(emptyEquipmentForm);
      setShowAddEquipment(false);
      setSelectedId(data.id);
    }
    setSaving(false);
  }

  async function handleDeleteEquipment(id: string) {
    const supabase = createClient();
    const { error: deleteError } = await supabase.from("equipment").delete().eq("id", id);
    if (!deleteError) {
      setEquipmentList((prev) => prev.filter((e) => e.id !== id));
      setScheduleItems((prev) => prev.filter((i) => i.equipment_id !== id));
      setLogs((prev) => prev.filter((l) => l.equipment_id !== id));
      if (selectedId === id) setSelectedId(null);
    }
  }

  async function handleSaveHours() {
    if (!selectedEquipment || !hoursInput) return;
    setSaving(true);
    const supabase = createClient();
    const { data, error: updateError } = await supabase
      .from("equipment")
      .update({ current_hours: parseFloat(hoursInput) })
      .eq("id", selectedEquipment.id)
      .select()
      .single();
    if (!updateError && data) {
      setEquipmentList((prev) => prev.map((e) => (e.id === data.id ? data : e)));
      setEditingHours(false);
    }
    setSaving(false);
  }

  async function handleSuggest() {
    if (!selectedEquipment) return;
    setSuggesting(true);
    setError(null);
    setDraftItems(null);
    try {
      const res = await fetch("/api/equipment/suggest-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: selectedEquipment.name,
          make: selectedEquipment.make,
          model: selectedEquipment.model,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setDraftItems(data.items);
      }
    } catch {
      setError("AI suggestion request failed. Try again.");
    }
    setSuggesting(false);
  }

  async function handleSaveDraftItems() {
    if (!selectedEquipment || !draftItems) return;
    setSaving(true);
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("maintenance_schedule_items")
      .insert(
        draftItems.map((d) => ({
          equipment_id: selectedEquipment.id,
          task: d.task,
          interval_hours: d.interval_hours,
          interval_days: d.interval_days,
          source: "ai_suggested",
          notes: d.notes || null,
        }))
      )
      .select();
    if (!insertError && data) {
      setScheduleItems((prev) => [...prev, ...data]);
      setDraftItems(null);
    } else if (insertError) {
      setError(insertError.message);
    }
    setSaving(false);
  }

  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedEquipment || !addItemForm.task) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("maintenance_schedule_items")
      .insert({
        equipment_id: selectedEquipment.id,
        task: addItemForm.task,
        interval_hours: addItemForm.interval_hours ? parseFloat(addItemForm.interval_hours) : null,
        interval_days: addItemForm.interval_days ? parseFloat(addItemForm.interval_days) : null,
        source: "manual",
        notes: addItemForm.notes || null,
      })
      .select()
      .single();
    if (insertError) {
      setError(insertError.message);
    } else if (data) {
      setScheduleItems((prev) => [...prev, data]);
      setAddItemForm(emptyItemForm);
      setShowAddItem(false);
    }
    setSaving(false);
  }

  function startEditItem(item: ScheduleItem) {
    setEditingItemId(item.id);
    setEditItemForm({
      task: item.task,
      interval_hours: item.interval_hours != null ? String(item.interval_hours) : "",
      interval_days: item.interval_days != null ? String(item.interval_days) : "",
      notes: item.notes ?? "",
    });
  }

  async function handleSaveEditItem(item: ScheduleItem) {
    setSaving(true);
    const supabase = createClient();
    const newSource = item.source === "manual" ? "manual" : "ai_suggested_edited";
    const { data, error: updateError } = await supabase
      .from("maintenance_schedule_items")
      .update({
        task: editItemForm.task,
        interval_hours: editItemForm.interval_hours ? parseFloat(editItemForm.interval_hours) : null,
        interval_days: editItemForm.interval_days ? parseFloat(editItemForm.interval_days) : null,
        notes: editItemForm.notes || null,
        source: newSource,
      })
      .eq("id", item.id)
      .select()
      .single();
    if (!updateError && data) {
      setScheduleItems((prev) => prev.map((i) => (i.id === item.id ? data : i)));
      setEditingItemId(null);
    }
    setSaving(false);
  }

  async function handleDeleteItem(id: string) {
    const supabase = createClient();
    const { error: deleteError } = await supabase.from("maintenance_schedule_items").delete().eq("id", id);
    if (!deleteError) setScheduleItems((prev) => prev.filter((i) => i.id !== id));
  }

  async function handleAddLog(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedEquipment || !addLogForm.task) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("maintenance_log")
      .insert({
        equipment_id: selectedEquipment.id,
        task: addLogForm.task,
        performed_at: addLogForm.performed_at || new Date().toISOString().slice(0, 10),
        hours_at_service: addLogForm.hours_at_service ? parseFloat(addLogForm.hours_at_service) : null,
        cost: addLogForm.cost ? parseFloat(addLogForm.cost) : null,
        notes: addLogForm.notes || null,
      })
      .select()
      .single();
    if (insertError) {
      setError(insertError.message);
    } else if (data) {
      setLogs((prev) => [data, ...prev]);
      setAddLogForm(emptyLogForm);
      setShowAddLog(false);
    }
    setSaving(false);
  }

  async function handleDeleteLog(id: string) {
    const supabase = createClient();
    const { error: deleteError } = await supabase.from("maintenance_log").delete().eq("id", id);
    if (!deleteError) setLogs((prev) => prev.filter((l) => l.id !== id));
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
        <div className="text-sm text-mist">Set up your course profile before tracking equipment.</div>
      </div>
    );
  }

  return (
    <>
      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-green-forest mb-1">
          Equipment Management
        </div>
        <div className="font-serif text-2xl text-green-dark">Fleet &amp; Service Tracking</div>
        <div className="text-[13px] text-mist mt-1">
          {courseName} · {equipmentList.filter((e) => e.is_active).length} active units
        </div>
      </div>

      {worstIssue && (
        <AlertBanner
          variant={worstIssue.status.status === "OVERDUE" ? "red" : "amber"}
          icon="🔧"
          title={`${worstIssue.equipment.name} — ${worstIssue.item.task} ${worstIssue.status.status}`}
          body={`${worstIssue.equipment.make ?? ""} ${worstIssue.equipment.model ?? ""} · Current: ${worstIssue.equipment.current_hours} hrs${
            worstIssue.status.hoursRemaining != null
              ? ` · ${worstIssue.status.hoursRemaining < 0 ? `${Math.abs(worstIssue.status.hoursRemaining).toFixed(0)} hrs overdue` : `${worstIssue.status.hoursRemaining.toFixed(0)} hrs remaining`}`
              : ""
          }${
            worstIssue.status.daysRemaining != null
              ? ` · ${worstIssue.status.daysRemaining < 0 ? `${Math.abs(worstIssue.status.daysRemaining)} days overdue` : `${worstIssue.status.daysRemaining} days remaining`}`
              : ""
          }`}
        />
      )}

      {error && (
        <div className="bg-red/5 border-[1.5px] border-red/40 rounded-lg px-4 py-2 text-xs text-red">{error}</div>
      )}

      <div className="bg-white border-[1.5px] border-rule rounded-[10px] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b-[1.5px] border-rule">
          <div className="font-serif text-lg text-green-dark">Fleet</div>
          <button
            onClick={() => setShowAddEquipment((v) => !v)}
            className="px-3.5 py-1.5 bg-green-mid text-white text-xs font-semibold rounded-lg hover:bg-green-dark transition-colors"
          >
            {showAddEquipment ? "Cancel" : "+ Add Equipment"}
          </button>
        </div>

        {showAddEquipment && (
          <form onSubmit={handleAddEquipment} className="flex flex-wrap items-end gap-3 px-5 py-4 border-b-[1.5px] border-rule bg-chalk">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide">Name</label>
              <input
                type="text"
                required
                value={addEquipmentForm.name}
                onChange={(e) => setAddEquipmentForm({ ...addEquipmentForm, name: e.target.value })}
                placeholder="Greens Mower #1"
                className="w-36 px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid focus:ring-2 focus:ring-green-mid/10"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide">Make</label>
              <input
                type="text"
                value={addEquipmentForm.make}
                onChange={(e) => setAddEquipmentForm({ ...addEquipmentForm, make: e.target.value })}
                placeholder="Toro"
                className="w-24 px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid focus:ring-2 focus:ring-green-mid/10"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide">Model</label>
              <input
                type="text"
                value={addEquipmentForm.model}
                onChange={(e) => setAddEquipmentForm({ ...addEquipmentForm, model: e.target.value })}
                placeholder="GreensMaster 3250-D"
                className="w-40 px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid focus:ring-2 focus:ring-green-mid/10"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide">Serial #</label>
              <input
                type="text"
                value={addEquipmentForm.serial_number}
                onChange={(e) => setAddEquipmentForm({ ...addEquipmentForm, serial_number: e.target.value })}
                placeholder="40012345"
                className="w-32 px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid focus:ring-2 focus:ring-green-mid/10"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide">Current Hours</label>
              <input
                type="number"
                step="0.1"
                value={addEquipmentForm.current_hours}
                onChange={(e) => setAddEquipmentForm({ ...addEquipmentForm, current_hours: e.target.value })}
                placeholder="0"
                className="w-24 px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid focus:ring-2 focus:ring-green-mid/10"
              />
            </div>
            <button type="submit" disabled={saving} className="px-4 py-2 bg-green-mid text-white text-sm font-semibold rounded-lg hover:bg-green-dark transition-colors disabled:opacity-50">
              {saving ? "Saving..." : "Save"}
            </button>
          </form>
        )}

        {equipmentList.length === 0 ? (
          <div className="p-10 text-center">
            <div className="text-4xl mb-3">🔧</div>
            <div className="text-sm text-mist">No equipment added yet. Add your first piece above.</div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-mono uppercase tracking-wider text-mist border-b border-rule">
                <th className="text-left px-5 py-2.5 font-medium">Name</th>
                <th className="text-left px-3 py-2.5 font-medium">Make / Model</th>
                <th className="text-left px-3 py-2.5 font-medium">Serial</th>
                <th className="text-left px-3 py-2.5 font-medium">Hours</th>
                <th className="text-left px-3 py-2.5 font-medium">Status</th>
                <th className="text-right px-5 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {equipmentList.map((eq) => {
                const eqItems = scheduleItems.filter((i) => i.equipment_id === eq.id);
                const worstForEq = eqItems
                  .map((i) => getDueStatus(i, eq, logs))
                  .reduce<"OK" | "DUE SOON" | "OVERDUE">((acc, s) => {
                    if (s.status === "OVERDUE" || acc === "OVERDUE") return s.status === "OVERDUE" ? "OVERDUE" : acc;
                    if (s.status === "DUE SOON" || acc === "DUE SOON") return "DUE SOON";
                    return acc;
                  }, "OK");
                return (
                  <tr
                    key={eq.id}
                    onClick={() => setSelectedId(eq.id)}
                    className={`border-b border-rule last:border-0 cursor-pointer hover:bg-chalk ${selectedId === eq.id ? "bg-green-pale" : ""}`}
                  >
                    <td className="px-5 py-2.5 font-medium">{eq.name}</td>
                    <td className="px-3 py-2.5 text-mist">
                      {eq.make} {eq.model}
                    </td>
                    <td className="px-3 py-2.5 text-mist font-mono">{eq.serial_number || "—"}</td>
                    <td className="px-3 py-2.5 font-mono">{eq.current_hours} hrs</td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded font-mono ${
                          worstForEq === "OVERDUE"
                            ? "bg-red/10 text-red"
                            : worstForEq === "DUE SOON"
                            ? "bg-amber/10 text-[#92400e]"
                            : "bg-green-pale text-green-mid"
                        }`}
                      >
                        {worstForEq}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteEquipment(eq.id);
                        }}
                        className="text-mist text-xs font-semibold hover:text-red"
                      >
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

      {selectedEquipment && (
        <div className="bg-white border-[1.5px] border-rule rounded-[10px] overflow-hidden">
          <div className="bg-green-dark p-5 flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="font-serif text-xl text-white mb-1">{selectedEquipment.name}</div>
              <div className="text-[11px] text-white/50">
                {selectedEquipment.make} {selectedEquipment.model} · S/N {selectedEquipment.serial_number || "—"}
              </div>
            </div>
            <div className="text-right">
              {editingHours ? (
                <span className="inline-flex items-center gap-2">
                  <input
                    type="number"
                    step="0.1"
                    value={hoursInput}
                    onChange={(e) => setHoursInput(e.target.value)}
                    className="w-24 px-2 py-1 border-[1.5px] border-rule rounded text-sm outline-none"
                  />
                  <button onClick={handleSaveHours} disabled={saving} className="text-green-bright text-xs font-semibold">
                    Save
                  </button>
                  <button onClick={() => setEditingHours(false)} className="text-white/50 text-xs font-semibold">
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => {
                    setEditingHours(true);
                    setHoursInput(String(selectedEquipment.current_hours));
                  }}
                  className="text-white text-sm font-mono"
                >
                  {selectedEquipment.current_hours} hrs <span className="text-green-bright text-xs">Edit</span>
                </button>
              )}
            </div>
          </div>

          <div className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="font-serif text-base text-green-dark">Maintenance Schedule</div>
              <div className="flex gap-2">
                <button
                  onClick={handleSuggest}
                  disabled={suggesting || (!selectedEquipment.make && !selectedEquipment.model)}
                  className="px-3 py-1.5 bg-green-bright/20 text-green-mid border border-green-bright/40 text-xs font-semibold rounded-lg hover:bg-green-bright/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  title={!selectedEquipment.make && !selectedEquipment.model ? "Add a make/model to enable" : ""}
                >
                  {suggesting ? "Asking Claude..." : "✨ Suggest with AI"}
                </button>
                <button
                  onClick={() => setShowAddItem((v) => !v)}
                  className="px-3 py-1.5 bg-green-mid text-white text-xs font-semibold rounded-lg hover:bg-green-dark transition-colors"
                >
                  {showAddItem ? "Cancel" : "+ Add Manually"}
                </button>
              </div>
            </div>

            {draftItems && (
              <div className="border-[1.5px] border-green-bright/40 bg-green-pale/40 rounded-lg p-3 mb-3">
                <div className="text-[10px] font-bold uppercase tracking-wide text-green-mid mb-2">
                  AI-Suggested — Review Before Saving
                </div>
                {draftItems.map((d, i) => (
                  <div key={i} className="flex items-center gap-2 mb-1.5 text-xs">
                    <input
                      value={d.task}
                      onChange={(e) => setDraftItems((prev) => prev!.map((x, xi) => (xi === i ? { ...x, task: e.target.value } : x)))}
                      className="flex-1 px-2 py-1 border-[1.5px] border-rule rounded"
                    />
                    <input
                      type="number"
                      value={d.interval_hours ?? ""}
                      onChange={(e) =>
                        setDraftItems((prev) =>
                          prev!.map((x, xi) => (xi === i ? { ...x, interval_hours: e.target.value ? parseFloat(e.target.value) : null } : x))
                        )
                      }
                      placeholder="hrs"
                      className="w-16 px-2 py-1 border-[1.5px] border-rule rounded"
                    />
                    <input
                      type="number"
                      value={d.interval_days ?? ""}
                      onChange={(e) =>
                        setDraftItems((prev) =>
                          prev!.map((x, xi) => (xi === i ? { ...x, interval_days: e.target.value ? parseFloat(e.target.value) : null } : x))
                        )
                      }
                      placeholder="days"
                      className="w-16 px-2 py-1 border-[1.5px] border-rule rounded"
                    />
                    <span className="text-mist flex-1">{d.notes}</span>
                    <button onClick={() => setDraftItems((prev) => prev!.filter((_, xi) => xi !== i))} className="text-red font-semibold">
                      Remove
                    </button>
                  </div>
                ))}
                <div className="flex gap-2 mt-2">
                  <button onClick={handleSaveDraftItems} disabled={saving} className="px-3 py-1.5 bg-green-mid text-white text-xs font-semibold rounded-lg">
                    Save All
                  </button>
                  <button onClick={() => setDraftItems(null)} className="px-3 py-1.5 text-mist text-xs font-semibold">
                    Discard
                  </button>
                </div>
              </div>
            )}

            {showAddItem && (
              <form onSubmit={handleAddItem} className="flex flex-wrap items-end gap-2 mb-3 bg-chalk p-3 rounded-lg">
                <input
                  required
                  value={addItemForm.task}
                  onChange={(e) => setAddItemForm({ ...addItemForm, task: e.target.value })}
                  placeholder="Task"
                  className="px-2 py-1.5 border-[1.5px] border-rule rounded text-xs"
                />
                <input
                  type="number"
                  value={addItemForm.interval_hours}
                  onChange={(e) => setAddItemForm({ ...addItemForm, interval_hours: e.target.value })}
                  placeholder="Interval hrs"
                  className="w-24 px-2 py-1.5 border-[1.5px] border-rule rounded text-xs"
                />
                <input
                  type="number"
                  value={addItemForm.interval_days}
                  onChange={(e) => setAddItemForm({ ...addItemForm, interval_days: e.target.value })}
                  placeholder="Interval days"
                  className="w-24 px-2 py-1.5 border-[1.5px] border-rule rounded text-xs"
                />
                <input
                  value={addItemForm.notes}
                  onChange={(e) => setAddItemForm({ ...addItemForm, notes: e.target.value })}
                  placeholder="Notes"
                  className="flex-1 min-w-[100px] px-2 py-1.5 border-[1.5px] border-rule rounded text-xs"
                />
                <button type="submit" disabled={saving} className="px-3 py-1.5 bg-green-mid text-white text-xs font-semibold rounded-lg">
                  Save
                </button>
              </form>
            )}

            {selectedItems.length === 0 ? (
              <div className="text-sm text-mist text-center py-6">No schedule items yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] font-mono uppercase tracking-wider text-mist border-b border-rule">
                    <th className="text-left py-2 font-medium">Task</th>
                    <th className="text-left py-2 font-medium">Interval</th>
                    <th className="text-left py-2 font-medium">Status</th>
                    <th className="text-left py-2 font-medium">Source</th>
                    <th className="text-right py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedItems.map((item) => {
                    const due = getDueStatus(item, selectedEquipment, logs);
                    return editingItemId === item.id ? (
                      <tr key={item.id} className="border-b border-rule last:border-0">
                        <td className="py-2">
                          <input
                            value={editItemForm.task}
                            onChange={(e) => setEditItemForm({ ...editItemForm, task: e.target.value })}
                            className="px-2 py-1 border-[1.5px] border-rule rounded text-xs w-full"
                          />
                        </td>
                        <td className="py-2">
                          <div className="flex gap-1">
                            <input
                              type="number"
                              value={editItemForm.interval_hours}
                              onChange={(e) => setEditItemForm({ ...editItemForm, interval_hours: e.target.value })}
                              placeholder="hrs"
                              className="w-16 px-2 py-1 border-[1.5px] border-rule rounded text-xs"
                            />
                            <input
                              type="number"
                              value={editItemForm.interval_days}
                              onChange={(e) => setEditItemForm({ ...editItemForm, interval_days: e.target.value })}
                              placeholder="days"
                              className="w-16 px-2 py-1 border-[1.5px] border-rule rounded text-xs"
                            />
                          </div>
                        </td>
                        <td colSpan={2} />
                        <td className="py-2 text-right whitespace-nowrap">
                          <button onClick={() => handleSaveEditItem(item)} className="text-green-mid text-xs font-semibold mr-2">
                            Save
                          </button>
                          <button onClick={() => setEditingItemId(null)} className="text-mist text-xs font-semibold">
                            Cancel
                          </button>
                        </td>
                      </tr>
                    ) : (
                      <tr key={item.id} className="border-b border-rule last:border-0">
                        <td className="py-2 font-medium">{item.task}</td>
                        <td className="py-2 text-mist font-mono">
                          {item.interval_hours != null ? `${item.interval_hours}h` : ""}
                          {item.interval_hours != null && item.interval_days != null ? " / " : ""}
                          {item.interval_days != null ? `${item.interval_days}d` : ""}
                        </td>
                        <td className="py-2">
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded font-mono ${
                              due.status === "OVERDUE"
                                ? "bg-red/10 text-red"
                                : due.status === "DUE SOON"
                                ? "bg-amber/10 text-[#92400e]"
                                : "bg-green-pale text-green-mid"
                            }`}
                          >
                            {due.status}
                          </span>
                        </td>
                        <td className="py-2">
                          <span className="text-[9px] text-mist uppercase font-mono">
                            {item.source === "manual" ? "Manual" : item.source === "ai_suggested" ? "AI-suggested" : "AI-suggested, edited"}
                          </span>
                        </td>
                        <td className="py-2 text-right whitespace-nowrap">
                          <button onClick={() => startEditItem(item)} className="text-mist text-xs font-semibold hover:text-green-dark mr-2">
                            Edit
                          </button>
                          <button onClick={() => handleDeleteItem(item.id)} className="text-mist text-xs font-semibold hover:text-red">
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

          <div className="p-5 border-t border-rule">
            <div className="flex items-center justify-between mb-3">
              <div className="font-serif text-base text-green-dark">Maintenance Log</div>
              <button
                onClick={() => setShowAddLog((v) => !v)}
                className="px-3 py-1.5 bg-green-mid text-white text-xs font-semibold rounded-lg hover:bg-green-dark transition-colors"
              >
                {showAddLog ? "Cancel" : "+ Log Service"}
              </button>
            </div>

            {showAddLog && (
              <form onSubmit={handleAddLog} className="flex flex-wrap items-end gap-2 mb-3 bg-chalk p-3 rounded-lg">
                <input
                  required
                  value={addLogForm.task}
                  onChange={(e) => setAddLogForm({ ...addLogForm, task: e.target.value })}
                  placeholder="Task (match schedule item name)"
                  className="px-2 py-1.5 border-[1.5px] border-rule rounded text-xs"
                  list="task-suggestions"
                />
                <datalist id="task-suggestions">
                  {selectedItems.map((i) => (
                    <option key={i.id} value={i.task} />
                  ))}
                </datalist>
                <input
                  type="date"
                  value={addLogForm.performed_at}
                  onChange={(e) => setAddLogForm({ ...addLogForm, performed_at: e.target.value })}
                  className="px-2 py-1.5 border-[1.5px] border-rule rounded text-xs"
                />
                <input
                  type="number"
                  step="0.1"
                  value={addLogForm.hours_at_service}
                  onChange={(e) => setAddLogForm({ ...addLogForm, hours_at_service: e.target.value })}
                  placeholder="Hours at service"
                  className="w-32 px-2 py-1.5 border-[1.5px] border-rule rounded text-xs"
                />
                <input
                  type="number"
                  step="0.01"
                  value={addLogForm.cost}
                  onChange={(e) => setAddLogForm({ ...addLogForm, cost: e.target.value })}
                  placeholder="Cost"
                  className="w-24 px-2 py-1.5 border-[1.5px] border-rule rounded text-xs"
                />
                <input
                  value={addLogForm.notes}
                  onChange={(e) => setAddLogForm({ ...addLogForm, notes: e.target.value })}
                  placeholder="Notes"
                  className="flex-1 min-w-[100px] px-2 py-1.5 border-[1.5px] border-rule rounded text-xs"
                />
                <button type="submit" disabled={saving} className="px-3 py-1.5 bg-green-mid text-white text-xs font-semibold rounded-lg">
                  Save
                </button>
              </form>
            )}

            {selectedLogs.length === 0 ? (
              <div className="text-sm text-mist text-center py-6">No service history logged yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] font-mono uppercase tracking-wider text-mist border-b border-rule">
                    <th className="text-left py-2 font-medium">Date</th>
                    <th className="text-left py-2 font-medium">Task</th>
                    <th className="text-left py-2 font-medium">Hours</th>
                    <th className="text-left py-2 font-medium">Cost</th>
                    <th className="text-left py-2 font-medium">Notes</th>
                    <th className="text-right py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedLogs.map((log) => (
                    <tr key={log.id} className="border-b border-rule last:border-0">
                      <td className="py-2 text-mist">{log.performed_at}</td>
                      <td className="py-2 font-medium">{log.task}</td>
                      <td className="py-2 font-mono">{log.hours_at_service ?? "—"}</td>
                      <td className="py-2 font-mono">{log.cost != null ? `$${Number(log.cost).toFixed(2)}` : "—"}</td>
                      <td className="py-2 text-mist">{log.notes || "—"}</td>
                      <td className="py-2 text-right">
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
        </div>
      )}
    </>
  );
}
