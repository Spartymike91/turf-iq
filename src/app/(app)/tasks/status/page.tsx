"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { resolveCourseIdClient } from "@/lib/supabase/course-context";

interface Employee {
  id: string;
  name: string;
  course_member_id: string | null;
}

interface TaskAssignment {
  id: string;
  name: string;
  assigned_to: string | null;
  priority: "low" | "normal" | "high";
  status: "not_started" | "in_progress" | "complete";
  estimated_minutes: number | null;
  started_at: string | null;
  completed_at: string | null;
  quality_rating: number | null;
}

const STATUS_LABEL: Record<TaskAssignment["status"], string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  complete: "Complete",
};

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function TaskStatusPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [tasks, setTasks] = useState<TaskAssignment[]>([]);
  const [checking, setChecking] = useState(true);
  const [courseId, setCourseId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [myEmployeeId, setMyEmployeeId] = useState<string | null>(null);

  const [completingTask, setCompletingTask] = useState<TaskAssignment | null>(null);
  const [materialsCost, setMaterialsCost] = useState("");
  const [materialsNote, setMaterialsNote] = useState("");
  const [qualityRating, setQualityRating] = useState<number | null>(null);
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const context = await resolveCourseIdClient(supabase);

      if (!context || !user) {
        setChecking(false);
        return;
      }
      setCourseId(context.courseId);

      const [{ data: emp }, { data: assign }, { data: membership }] = await Promise.all([
        supabase.from("employees").select("id, name, course_member_id").eq("course_id", context.courseId),
        supabase.from("task_assignments").select("*").eq("course_id", context.courseId).eq("scheduled_date", todayStr()),
        supabase.from("course_members").select("id, role").eq("user_id", user.id).eq("course_id", context.courseId).maybeSingle(),
      ]);
      setEmployees(emp ?? []);
      setTasks(assign ?? []);
      setMyRole(membership?.role ?? null);
      setMyEmployeeId((emp ?? []).find((e) => e.course_member_id === membership?.id)?.id ?? null);
      setChecking(false);
    }
    load();
  }, []);

  function canManage(task: TaskAssignment) {
    return myRole === "owner" || myRole === "superintendent" || task.assigned_to === myEmployeeId;
  }

  async function advanceStatus(task: TaskAssignment) {
    // Only handles not_started -> in_progress now. Completion goes through
    // openCompleteDialog/handleCompleteTask instead, since it also triggers
    // labor/materials cost logging via /api/tasks/complete.
    try {
      const res = await fetch("/api/tasks/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignment_id: task.id }),
      });
      const data = await res.json();
      if (res.ok) {
        setTasks((prev) => prev.map((t) => (t.id === task.id ? data.assignment : t)));
      }
    } catch {
      // Best-effort — board just won't update if this fails.
    }
  }

  function openCompleteDialog(task: TaskAssignment) {
    setCompletingTask(task);
    setMaterialsCost("");
    setMaterialsNote("");
    setQualityRating(null);
    setCompleteError(null);
  }

  async function handleCompleteTask(e: React.FormEvent) {
    e.preventDefault();
    if (!completingTask) return;
    setCompleting(true);
    setCompleteError(null);
    try {
      const res = await fetch("/api/tasks/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignment_id: completingTask.id,
          materials_cost: materialsCost ? parseFloat(materialsCost) : undefined,
          materials_note: materialsNote || undefined,
          quality_rating: qualityRating ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCompleteError(data.error ?? "Could not complete task.");
      } else {
        setTasks((prev) => prev.map((t) => (t.id === completingTask.id ? data.assignment : t)));
        setCompletingTask(null);
      }
    } catch {
      setCompleteError("Could not complete task.");
    }
    setCompleting(false);
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
        <div className="text-sm text-mist">Set up your course profile first.</div>
      </div>
    );
  }

  const columns: TaskAssignment["status"][] = ["not_started", "in_progress", "complete"];

  return (
    <>
      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-green-forest mb-1">Live Status</div>
        <div className="font-serif text-2xl text-green-dark">Today&apos;s Task Board</div>
        <div className="text-[13px] text-mist mt-1">
          {tasks.filter((t) => t.status === "complete").length} of {tasks.length} complete
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="bg-white border-[1.5px] border-rule rounded-[10px] p-10 text-center">
          <div className="text-4xl mb-3">📋</div>
          <div className="text-sm text-mist">No tasks scheduled for today. Add some in the Scheduler.</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {columns.map((col) => (
            <div key={col} className="bg-white border-[1.5px] border-rule rounded-[10px] overflow-hidden shrink-0">
              <div className="px-4 py-3 border-b-[1.5px] border-rule font-serif text-sm text-green-dark">
                {STATUS_LABEL[col]} ({tasks.filter((t) => t.status === col).length})
              </div>
              <div className="p-3 flex flex-col gap-2 min-h-[100px]">
                {tasks
                  .filter((t) => t.status === col)
                  .map((t) => (
                    <div key={t.id} className="border-[1.5px] border-rule rounded-lg p-2.5 text-xs">
                      <div className="flex items-center justify-between gap-1.5 mb-1">
                        <span className="font-semibold text-ink">{t.name}</span>
                        <span
                          className={`text-[8px] font-bold px-1 py-0.5 rounded font-mono ${
                            t.priority === "high" ? "bg-red/10 text-red" : t.priority === "low" ? "bg-blue/10 text-blue" : "bg-green-pale text-green-mid"
                          }`}
                        >
                          {t.priority.toUpperCase()}
                        </span>
                      </div>
                      <div className="text-mist mb-2">{employees.find((e) => e.id === t.assigned_to)?.name ?? "Unassigned"}</div>
                      {col !== "complete" && canManage(t) && (
                        <button
                          onClick={() => (col === "not_started" ? advanceStatus(t) : openCompleteDialog(t))}
                          className="text-green-mid font-semibold hover:text-green-dark"
                        >
                          {col === "not_started" ? "Start →" : "Complete →"}
                        </button>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {completingTask && (
        <div className="fixed inset-0 bg-black/35 z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-[10px] p-6 max-w-sm w-full">
            <div className="font-serif text-lg text-green-dark mb-1">Mark Complete</div>
            <div className="text-sm text-mist mb-4">{completingTask.name}</div>
            <form onSubmit={handleCompleteTask} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wide">
                  Materials Cost <span className="text-mist font-normal normal-case">(optional — e.g. chemical used)</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={materialsCost}
                  onChange={(e) => setMaterialsCost(e.target.value)}
                  placeholder="0.00"
                  className="px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid"
                />
              </div>
              {materialsCost && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold uppercase tracking-wide">What was used</label>
                  <input
                    value={materialsNote}
                    onChange={(e) => setMaterialsNote(e.target.value)}
                    placeholder="e.g. 2 gal fungicide on #4-9 greens"
                    className="px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid"
                  />
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wide">
                  Quality <span className="text-mist font-normal normal-case">(optional, 1-5)</span>
                </label>
                <div className="flex gap-1.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setQualityRating(qualityRating === n ? null : n)}
                      className={`w-9 h-9 rounded-lg text-sm font-semibold border-[1.5px] transition-colors ${
                        qualityRating === n
                          ? "bg-green-mid text-white border-green-mid"
                          : "border-rule text-mist hover:border-green-mid"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              {completeError && <div className="text-xs text-red">{completeError}</div>}
              <div className="flex gap-2 mt-1">
                <button
                  type="submit"
                  disabled={completing}
                  className="flex-1 px-4 py-2.5 bg-green-mid text-white text-sm font-semibold rounded-lg hover:bg-green-dark transition-colors disabled:opacity-50"
                >
                  {completing ? "Saving..." : "Mark Complete"}
                </button>
                <button
                  type="button"
                  onClick={() => setCompletingTask(null)}
                  className="px-4 py-2.5 text-mist text-sm font-semibold hover:text-ink"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
