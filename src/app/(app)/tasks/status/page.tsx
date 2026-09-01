"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { resolveCourseIdClient } from "@/lib/supabase/course-context";
import TaskCompleteModal from "@/components/tasks/TaskCompleteModal";
import MowDirectionIcon from "@/components/tasks/MowDirectionIcon";
import type { MowDirection } from "@/lib/mowDirections";
import type { WeatherResult } from "@/lib/weather";

interface Employee {
  id: string;
  name: string;
  course_member_id: string | null;
}

interface TaskAssignment {
  id: string;
  name: string;
  assigned_to: string | null;
  priority: number;
  mow_direction: MowDirection | null;
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
  const [weather, setWeather] = useState<WeatherResult | null>(null);

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

    // Best-effort, separate from the board's core data — a weather outage
    // shouldn't hold up (or blank out) the crew board itself.
    fetch("/api/weather")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setWeather(data && !data.error ? data : null))
      .catch(() => setWeather(null));
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

  // Group today's tasks by crew member — each employee gets a card listing
  // their jobs in order, rather than one global board split by status.
  // Tasks with no assignee collect into a trailing "Unassigned" card.
  const crewCards = useMemo(() => {
    const byEmployee = new Map<string, TaskAssignment[]>();
    const unassigned: TaskAssignment[] = [];
    for (const t of tasks) {
      if (!t.assigned_to) {
        unassigned.push(t);
        continue;
      }
      if (!byEmployee.has(t.assigned_to)) byEmployee.set(t.assigned_to, []);
      byEmployee.get(t.assigned_to)!.push(t);
    }
    const cards = Array.from(byEmployee.entries())
      .map(([employeeId, employeeTasks]) => ({
        employeeId,
        name: employees.find((e) => e.id === employeeId)?.name ?? "Unknown",
        tasks: [...employeeTasks].sort((a, b) => a.priority - b.priority),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (unassigned.length > 0) {
      cards.push({ employeeId: "unassigned", name: "Unassigned", tasks: [...unassigned].sort((a, b) => a.priority - b.priority) });
    }
    return cards;
  }, [tasks, employees]);

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

  return (
    <>
      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-green-forest mb-1">Live Status</div>
        <div className="font-serif text-2xl text-green-dark">Today&apos;s Crew Board</div>
        <div className="text-[13px] text-mist mt-1">
          {tasks.filter((t) => t.status === "complete").length} of {tasks.length} complete
        </div>
      </div>

      {weather && (
        <div className="bg-white border-[1.5px] border-rule rounded-[10px] p-4 flex items-center gap-4">
          <div className="text-4xl">{weather.forecast[0]?.icon ?? "☀️"}</div>
          <div>
            <div className="text-lg font-semibold text-ink">
              {weather.current.tempF}°F — {weather.current.highF}° / {weather.current.lowF}°F
            </div>
            <div className="text-xs text-mist">{weather.current.description}</div>
          </div>
        </div>
      )}

      {tasks.length === 0 ? (
        <div className="bg-white border-[1.5px] border-rule rounded-[10px] p-10 text-center">
          <div className="text-4xl mb-3">📋</div>
          <div className="text-sm text-mist">No tasks scheduled for today. Add some in the Scheduler.</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {crewCards.map((card) => (
            <div key={card.employeeId} className="bg-white border-[1.5px] border-rule rounded-[10px] overflow-hidden shrink-0">
              <div className="px-4 py-3 border-b-[1.5px] border-rule font-serif text-sm text-green-dark">
                {card.name} ({card.tasks.filter((t) => t.status === "complete").length}/{card.tasks.length})
              </div>
              <div className="p-3 flex flex-col gap-2">
                {card.tasks.map((t, i) => (
                  <div key={t.id} className="border-[1.5px] border-rule rounded-lg p-2.5 text-xs">
                    <div className="flex items-center justify-between gap-1.5 mb-1">
                      <span className="font-semibold text-ink flex items-center gap-1.5">
                        <span className="text-mist font-mono">{i + 1}.</span>
                        {t.name}
                        <MowDirectionIcon direction={t.mow_direction} />
                      </span>
                      <span className="text-[8px] font-bold px-1 py-0.5 rounded font-mono bg-chalk text-mist shrink-0">
                        {STATUS_LABEL[t.status].toUpperCase()}
                      </span>
                    </div>
                    {t.status !== "complete" && canManage(t) && (
                      <button
                        onClick={() => (t.status === "not_started" ? advanceStatus(t) : openCompleteDialog(t))}
                        className="text-green-mid font-semibold hover:text-green-dark"
                      >
                        {t.status === "not_started" ? "Start →" : "Complete →"}
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
