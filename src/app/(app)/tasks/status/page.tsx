"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { resolveCourseIdClient } from "@/lib/supabase/course-context";

interface Employee {
  id: string;
  name: string;
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
}

const STATUS_ORDER: TaskAssignment["status"][] = ["not_started", "in_progress", "complete"];
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

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const context = await resolveCourseIdClient(supabase);

      if (!context) {
        setChecking(false);
        return;
      }
      setCourseId(context.courseId);

      const [{ data: emp }, { data: assign }] = await Promise.all([
        supabase.from("employees").select("id, name").eq("course_id", context.courseId),
        supabase.from("task_assignments").select("*").eq("course_id", context.courseId).eq("scheduled_date", todayStr()),
      ]);
      setEmployees(emp ?? []);
      setTasks(assign ?? []);
      setChecking(false);
    }
    load();
  }, []);

  async function advanceStatus(task: TaskAssignment) {
    const idx = STATUS_ORDER.indexOf(task.status);
    if (idx >= STATUS_ORDER.length - 1) return;
    const newStatus = STATUS_ORDER[idx + 1];
    const supabase = createClient();
    const updates: Record<string, unknown> = { status: newStatus };
    if (newStatus === "in_progress") updates.started_at = new Date().toISOString();
    if (newStatus === "complete") updates.completed_at = new Date().toISOString();

    const { data, error } = await supabase.from("task_assignments").update(updates).eq("id", task.id).select().single();
    if (!error && data) {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? data : t)));
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
        <div className="grid grid-cols-3 gap-3">
          {columns.map((col) => (
            <div key={col} className="bg-white border-[1.5px] border-rule rounded-[10px] overflow-hidden">
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
                      {col !== "complete" && (
                        <button
                          onClick={() => advanceStatus(t)}
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
    </>
  );
}
