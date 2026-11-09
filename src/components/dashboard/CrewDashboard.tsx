"use client";

import { localDateStr } from "@/lib/localDate";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import TaskCompleteModal from "@/components/tasks/TaskCompleteModal";
import TaskDetailModal, { type CrewTask } from "@/components/tasks/TaskDetailModal";
import ChatNotificationsToggle from "@/components/chat/ChatNotificationsToggle";
import type { WeatherResult } from "@/lib/weather";

type TaskAssignment = CrewTask;

interface Employee {
  id: string;
  name: string;
  course_member_id: string | null;
}

interface OpenEntry {
  id: string;
  clock_in: string;
}

const todayStr = () => localDateStr();
const clockTime = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

// Crew and crew leads land here instead of the full manager dashboard —
// that view buries "what do I do today" under agronomics, equipment
// stats, and an AI-generated briefing none of that audience asked for.
// This answers: am I clocked in, what's on MY list today (tap one for the
// full instructions and Start/Pause/Finish), what's the rest of the crew
// doing, and what's coming up.
export default function CrewDashboard({ courseId, courseName }: { courseId: string; courseName: string }) {
  const [weather, setWeather] = useState<WeatherResult | null>(null);
  const [todayTasks, setTodayTasks] = useState<TaskAssignment[]>([]);
  const [upcoming, setUpcoming] = useState<TaskAssignment[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [myEmployeeId, setMyEmployeeId] = useState<string | null>(null);
  const [openEntry, setOpenEntry] = useState<OpenEntry | null>(null);
  const [clockBusy, setClockBusy] = useState(false);
  const [clockError, setClockError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [completingTask, setCompletingTask] = useState<TaskAssignment | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [taskError, setTaskError] = useState<string | null>(null);

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

      const mine = (emp ?? []).find((e) => e.course_member_id === membershipResult.data?.id)?.id ?? null;
      let open: OpenEntry | null = null;
      if (mine) {
        const { data: entry } = await supabase
          .from("time_entries")
          .select("id, clock_in")
          .eq("employee_id", mine)
          .is("clock_out", null)
          .maybeSingle();
        open = entry ?? null;
      }

      setEmployees(emp ?? []);
      setTodayTasks(today ?? []);
      setUpcoming(future ?? []);
      setMyRole(membershipResult.data?.role ?? null);
      setMyEmployeeId(mine);
      setOpenEntry(open);
      setWeather(weatherResult && !weatherResult.error ? weatherResult : null);
      // A task notification deep-links here as /dashboard?task=<id>.
      const wanted = new URLSearchParams(window.location.search).get("task");
      if (wanted) setDetailId(wanted);
      setLoading(false);
    }
    load();
  }, [courseId]);

  function canManage(task: TaskAssignment) {
    return myRole === "owner" || myRole === "superintendent" || task.assigned_to === myEmployeeId;
  }

  async function clock(action: "clock_in" | "clock_out") {
    setClockBusy(true);
    setClockError(null);
    try {
      const res = await fetch("/api/time-clock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (res.ok) setOpenEntry(action === "clock_in" ? { id: data.entry.id, clock_in: data.entry.clock_in } : null);
      else setClockError(data.error ?? "Couldn't update your clock.");
    } catch {
      setClockError("Couldn't update your clock — check your connection.");
    }
    setClockBusy(false);
  }

  async function taskAction(task: TaskAssignment, action: "start" | "pause" | "resume") {
    setTaskError(null);
    try {
      const res = await fetch(`/api/tasks/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignment_id: task.id }),
      });
      const data = await res.json();
      if (res.ok) setTodayTasks((prev) => prev.map((t) => (t.id === task.id ? data.assignment : t)));
      else setTaskError(data.error ?? "Couldn't update that task.");
    } catch {
      setTaskError("Couldn't update that task — check your connection.");
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-mist">Loading...</div>
      </div>
    );
  }

  const nameOf = (id: string | null) => employees.find((e) => e.id === id)?.name ?? "Unassigned";
  const myTasks = myEmployeeId ? todayTasks.filter((t) => t.assigned_to === myEmployeeId) : [];
  const otherTasks = myEmployeeId ? todayTasks.filter((t) => t.assigned_to !== myEmployeeId) : todayTasks;
  const doneCount = todayTasks.filter((t) => t.status === "complete").length;
  const detailTask = detailId ? [...todayTasks, ...upcoming].find((t) => t.id === detailId) ?? null : null;
  const detailIsToday = !!detailTask && todayTasks.some((t) => t.id === detailTask.id);

  function TaskRow({ t, showActions }: { t: TaskAssignment; showActions: boolean }) {
    return (
      <div className="flex items-center gap-3 px-5 py-3.5">
        <button
          onClick={() => setDetailId(t.id)}
          className={`flex-1 text-left text-sm ${t.status === "complete" ? "text-mist line-through" : "text-ink font-medium"}`}
        >
          {t.icon ? `${t.icon} ` : ""}
          {t.name}
          {t.status === "paused" && t.paused_at && (
            <span className="ml-2 text-[10px] font-mono text-amber-800">⏸ since {clockTime(t.paused_at)}</span>
          )}
          {t.status === "in_progress" && <span className="ml-2 text-[10px] font-mono text-green-mid">in progress</span>}
        </button>
        {!showActions || t.assigned_to === myEmployeeId ? null : (
          <span className="text-xs text-mist whitespace-nowrap">{nameOf(t.assigned_to)}</span>
        )}
        {t.status === "complete" ? (
          <span className="text-xs text-green-mid whitespace-nowrap">✓ Done</span>
        ) : (
          canManage(t) && (
            <span className="flex items-center gap-3 whitespace-nowrap">
              {t.status === "not_started" && (
                <button onClick={() => taskAction(t, "start")} className="text-xs font-semibold text-green-mid hover:text-green-dark">
                  Start →
                </button>
              )}
              {t.status === "in_progress" && (
                <>
                  <button onClick={() => taskAction(t, "pause")} className="text-xs font-semibold text-amber-700 hover:text-amber-900">
                    ⏸ Pause
                  </button>
                  <button onClick={() => setCompletingTask(t)} className="text-xs font-semibold text-green-mid hover:text-green-dark">
                    Finish →
                  </button>
                </>
              )}
              {t.status === "paused" && (
                <button onClick={() => taskAction(t, "resume")} className="text-xs font-semibold text-amber-700 hover:text-amber-900">
                  ▶ Resume
                </button>
              )}
            </span>
          )
        )}
      </div>
    );
  }

  return (
    <>
      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-green-forest mb-1">Today</div>
        <div className="font-serif text-2xl text-green-dark">
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </div>
        <div className="text-[13px] text-mist mt-1">{courseName}</div>
      </div>

      <div className="bg-white border-[1.5px] border-rule rounded-[10px] p-4 flex flex-wrap items-center gap-3">
        {myEmployeeId ? (
          <>
            <div className="flex-1 min-w-[160px]">
              <div className="text-[10px] font-mono uppercase tracking-wider text-mist">Time clock</div>
              <div className={`text-lg font-semibold ${openEntry ? "text-green-dark" : "text-ink"}`}>
                {openEntry ? `Clocked in since ${clockTime(openEntry.clock_in)}` : "Not clocked in"}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => clock("clock_in")}
                disabled={clockBusy || !!openEntry}
                className="px-5 py-3 bg-green-mid text-white text-sm font-semibold rounded-lg hover:bg-green-dark transition-colors disabled:opacity-40"
              >
                Clock in
              </button>
              <button
                onClick={() => clock("clock_out")}
                disabled={clockBusy || !openEntry}
                className="px-5 py-3 border-[1.5px] border-rule text-ink text-sm font-semibold rounded-lg hover:border-green-mid transition-colors disabled:opacity-40"
              >
                Clock out
              </button>
            </div>
            {clockError && <div className="w-full text-xs text-red">{clockError}</div>}
          </>
        ) : (
          <div className="text-xs text-mist">
            Your login isn&apos;t linked to an employee record yet, so the time clock isn&apos;t available. Ask your manager to link it.
          </div>
        )}
      </div>

      {weather && (
        <div className="bg-white border-[1.5px] border-rule rounded-[10px] p-4 flex items-center gap-4">
          <div className="text-4xl">{weather.forecast[0]?.icon ?? "☀️"}</div>
          <div>
            <div className="text-lg font-semibold text-ink">
              {weather.current.highF}° / {weather.current.lowF}°F
            </div>
            <div className="text-xs text-mist">{weather.forecast[0]?.description ?? weather.current.description}</div>
          </div>
        </div>
      )}

      {taskError && <div className="bg-red/5 border-[1.5px] border-red/40 rounded-lg px-4 py-2 text-xs text-red">{taskError}</div>}

      <div className="bg-white border-[1.5px] border-rule rounded-[10px] overflow-hidden">
        <div className="px-5 py-4 border-b-[1.5px] border-rule flex items-center justify-between">
          <div className="font-serif text-lg text-green-dark">{myEmployeeId ? "My Tasks Today" : "Today's Direction"}</div>
          <div className="text-xs text-mist">
            {myEmployeeId ? `${myTasks.filter((t) => t.status === "complete").length} of ${myTasks.length} done` : `${doneCount} of ${todayTasks.length} done`}
          </div>
        </div>
        {(myEmployeeId ? myTasks : todayTasks).length === 0 ? (
          <div className="p-10 text-center text-sm text-mist">No tasks assigned to you today.</div>
        ) : (
          <div className="divide-y divide-rule">
            {(myEmployeeId ? myTasks : todayTasks).map((t) => (
              <TaskRow key={t.id} t={t} showActions={!myEmployeeId} />
            ))}
          </div>
        )}
      </div>

      {myEmployeeId && otherTasks.length > 0 && (
        <div className="bg-white border-[1.5px] border-rule rounded-[10px] overflow-hidden">
          <div className="px-5 py-4 border-b-[1.5px] border-rule font-serif text-lg text-green-dark">Rest of the Crew</div>
          <div className="divide-y divide-rule">
            {otherTasks.map((t) => (
              <TaskRow key={t.id} t={t} showActions />
            ))}
          </div>
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="bg-white border-[1.5px] border-rule rounded-[10px] overflow-hidden">
          <div className="px-5 py-4 border-b-[1.5px] border-rule font-serif text-lg text-green-dark">Upcoming</div>
          <div className="divide-y divide-rule">
            {upcoming.map((t) => (
              <button key={t.id} onClick={() => setDetailId(t.id)} className="w-full flex items-center gap-3 px-5 py-3 text-sm text-left">
                <span className="text-xs font-mono text-mist w-16 shrink-0">
                  {new Date(`${t.scheduled_date}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" })}
                </span>
                <span className="flex-1 text-ink">{t.icon ? `${t.icon} ` : ""}{t.name}</span>
                <span className="text-xs text-mist whitespace-nowrap">{nameOf(t.assigned_to)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white border-[1.5px] border-rule rounded-[10px] px-5 py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-mist max-w-[320px]">Get a phone notification when a task is assigned to you or changes.</div>
        <ChatNotificationsToggle />
      </div>

      {detailTask && (
        <TaskDetailModal
          task={detailTask}
          assigneeName={nameOf(detailTask.assigned_to)}
          canAct={detailIsToday && canManage(detailTask)}
          onClose={() => setDetailId(null)}
          onAction={(action) => taskAction(detailTask, action)}
          onFinish={() => {
            setDetailId(null);
            setCompletingTask(detailTask);
          }}
        />
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
