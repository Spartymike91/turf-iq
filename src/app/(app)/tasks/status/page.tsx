"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { resolveCourseIdClient } from "@/lib/supabase/course-context";
import TaskCompleteModal from "@/components/tasks/TaskCompleteModal";

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
        <TaskCompleteModal
          task={completingTask}
          onClose={() => setCompletingTask(null)}
          onCompleted={(updated) =>
            setTasks((prev) => prev.map((t) => (t.id === updated.id ? (updated as unknown as TaskAssignment) : t)))
          }
        />
      )}
    </>
  );
}
