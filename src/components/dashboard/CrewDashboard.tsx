"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import TaskCompleteModal from "@/components/tasks/TaskCompleteModal";
import type { WeatherResult } from "@/lib/weather";

interface TaskAssignment {
  id: string;
  name: string;
  assigned_to: string | null;
  priority: number;
  status: "not_started" | "in_progress" | "paused" | "complete";
  paused_at: string | null;
  scheduled_date: string;
}

interface Employee {
  id: string;
  name: string;
  course_member_id: string | null;
}

const todayStr = () => new Date().toISOString().slice(0, 10);

// Crew and crew leads land here instead of the full manager dashboard —
// that view buries "what do I do today" under agronomics, equipment
// stats, and an AI-generated briefing none of that audience asked for.
// This just answers: what's on my list today, and what's coming up.
export default function CrewDashboard({ courseId, courseName }: { courseId: string; courseName: string }) {
  const [weather, setWeather] = useState<WeatherResult | null>(null);
  const [todayTasks, setTodayTasks] = useState<TaskAssignment[]>([]);
  const [upcoming, setUpcoming] = useState<TaskAssignment[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [myEmployeeId, setMyEmployeeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [completingTask, setCompletingTask] = useState<TaskAssignment | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const [{ data: emp }, { data: today }, { data: future }, membershipResult, weatherResult] = await Promise.all([
        supabase.from("employees").select("id, name, course_member_id").eq("course_id", courseId),
        supabase.from("task_assignments").select("*").eq("course_id", courseId).eq("scheduled_date", todayStr()),
        supabase
          .from("task_assignments")
          .select("*")
          .eq("course_id", courseId)
          .gt("scheduled_date", todayStr())
          .order("scheduled_date", { ascending: true })
          .limit(15),
        user
          ? supabase.from("course_members").select("id, role").eq("user_id", user.id).eq("course_id", courseId).maybeSingle()
          : Promise.resolve({ data: null }),
        fetch("/api/weather")
          .then((res) => (res.ok ? res.json() : null))
          .catch(() => null),
      ]);

      setEmployees(emp ?? []);
      setTodayTasks(today ?? []);
      setUpcoming(future ?? []);
      setMyRole(membershipResult.data?.role ?? null);
      setMyEmployeeId((emp ?? []).find((e) => e.course_member_id === membershipResult.data?.id)?.id ?? null);
      setWeather(weatherResult && !weatherResult.error ? weatherResult : null);
      setLoading(false);
    }
    load();
  }, [courseId]);

  function canManage(task: TaskAssignment) {
    return myRole === "owner" || myRole === "superintendent" || task.assigned_to === myEmployeeId;
  }

  async function startTask(task: TaskAssignment) {
    try {
      const res = await fetch("/api/tasks/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignment_id: task.id }),
      });
      const data = await res.json();
      if (res.ok) {
        setTodayTasks((prev) => prev.map((t) => (t.id === task.id ? data.assignment : t)));
      }
    } catch {
      // Best-effort — list just won't update if this fails.
    }
  }

  async function pauseTask(task: TaskAssignment) {
    try {
      const res = await fetch("/api/tasks/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignment_id: task.id }),
      });
      const data = await res.json();
      if (res.ok) {
        setTodayTasks((prev) => prev.map((t) => (t.id === task.id ? data.assignment : t)));
      }
    } catch {
      // Best-effort — list just won't update if this fails.
    }
  }

  async function resumeTask(task: TaskAssignment) {
    try {
      const res = await fetch("/api/tasks/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignment_id: task.id }),
      });
      const data = await res.json();
      if (res.ok) {
        setTodayTasks((prev) => prev.map((t) => (t.id === task.id ? data.assignment : t)));
      }
    } catch {
      // Best-effort — list just won't update if this fails.
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-mist">Loading...</div>
      </div>
    );
  }

  const doneCount = todayTasks.filter((t) => t.status === "complete").length;

  return (
    <>
      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-green-forest mb-1">Today</div>
        <div className="font-serif text-2xl text-green-dark">
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </div>
        <div className="text-[13px] text-mist mt-1">{courseName}</div>
      </div>

      {weather && (
        <div className="bg-white border-[1.5px] border-rule rounded-[10px] p-4 flex items-center gap-4">
          <div className="text-4xl">{weather.forecast[0]?.icon ?? "☀️"}</div>
          <div>
            <div className="text-lg font-semibold text-ink">
              {weather.current.highF}° / {weather.current.lowF}°F
            </div>
            <div className="text-xs text-mist">
              {weather.forecast[0]?.description ?? weather.current.description}
            </div>
          </div>
        </div>
      )}

      <div className="bg-white border-[1.5px] border-rule rounded-[10px] overflow-hidden">
        <div className="px-5 py-4 border-b-[1.5px] border-rule flex items-center justify-between">
          <div className="font-serif text-lg text-green-dark">Today&apos;s Direction</div>
          <div className="text-xs text-mist">
            {doneCount} of {todayTasks.length} done
          </div>
        </div>
        {todayTasks.length === 0 ? (
          <div className="p-10 text-center text-sm text-mist">No tasks scheduled for today.</div>
        ) : (
          <div className="divide-y divide-rule">
            {todayTasks.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-5 py-3.5">
                <span
                  className={`flex-1 text-sm ${
                    t.status === "complete" ? "text-mist line-through" : "text-ink font-medium"
                  }`}
                >
                  {t.name}
                  {t.status === "paused" && t.paused_at && (
                    <span className="ml-2 text-[10px] font-mono text-amber-800">
                      ⏸ since{" "}
                      {new Date(t.paused_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                    </span>
                  )}
                </span>
                <span className="text-xs text-mist whitespace-nowrap">
                  {employees.find((e) => e.id === t.assigned_to)?.name ?? "Unassigned"}
                </span>
                {t.status === "complete" ? (
                  <span className="text-xs text-green-mid whitespace-nowrap">✓ Done</span>
                ) : (
                  canManage(t) && (
                    <span className="flex items-center gap-3 whitespace-nowrap">
                      {t.status === "not_started" && (
                        <button onClick={() => startTask(t)} className="text-xs font-semibold text-green-mid hover:text-green-dark">
                          Start →
                        </button>
                      )}
                      {t.status === "in_progress" && (
                        <>
                          <button onClick={() => pauseTask(t)} className="text-xs font-semibold text-amber-700 hover:text-amber-900">
                            ⏸ Pause
                          </button>
                          <button
                            onClick={() => setCompletingTask(t)}
                            className="text-xs font-semibold text-green-mid hover:text-green-dark"
                          >
                            Complete →
                          </button>
                        </>
                      )}
                      {t.status === "paused" && (
                        <button onClick={() => resumeTask(t)} className="text-xs font-semibold text-amber-700 hover:text-amber-900">
                          ▶ Resume
                        </button>
                      )}
                    </span>
                  )
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {upcoming.length > 0 && (
        <div className="bg-white border-[1.5px] border-rule rounded-[10px] overflow-hidden">
          <div className="px-5 py-4 border-b-[1.5px] border-rule font-serif text-lg text-green-dark">Upcoming</div>
          <div className="divide-y divide-rule">
            {upcoming.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <span className="text-xs font-mono text-mist w-16 shrink-0">
                  {new Date(`${t.scheduled_date}T00:00:00`).toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "numeric",
                    day: "numeric",
                  })}
                </span>
                <span className="flex-1 text-ink">{t.name}</span>
                <span className="text-xs text-mist whitespace-nowrap">
                  {employees.find((e) => e.id === t.assigned_to)?.name ?? "Unassigned"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {completingTask && (
        <TaskCompleteModal
          task={completingTask}
          onClose={() => setCompletingTask(null)}
          onCompleted={(updated) =>
            setTodayTasks((prev) => prev.map((t) => (t.id === updated.id ? (updated as unknown as TaskAssignment) : t)))
          }
        />
      )}
    </>
  );
}
