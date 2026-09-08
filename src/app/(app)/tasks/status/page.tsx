"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { resolveCourseIdClient } from "@/lib/supabase/course-context";
import TaskCompleteModal from "@/components/tasks/TaskCompleteModal";
import MowDirectionIcon from "@/components/tasks/MowDirectionIcon";
import type { MowDirection } from "@/lib/mowDirections";
import CleanupLapDirectionIcon from "@/components/tasks/CleanupLapDirectionIcon";
import type { CleanupLapDirection } from "@/lib/cleanupLapDirections";
import type { WeatherResult } from "@/lib/weather";
import MonthCalendar, { type CalendarEvent } from "@/components/tasks/MonthCalendar";

interface Employee {
  id: string;
  name: string;
  color: string | null;
  course_member_id: string | null;
}

interface TaskAssignment {
  id: string;
  name: string;
  assigned_to: string | null;
  priority: number;
  mow_direction: MowDirection | null;
  cleanup_lap_direction: CleanupLapDirection | null;
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

  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const now = new Date();
  const [calendarYear, setCalendarYear] = useState(now.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(now.getMonth());
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [eventForm, setEventForm] = useState({
    event_type: "special_event" as "special_event" | "time_off",
    employee_id: "",
    title: "",
    start_date: todayStr(),
    end_date: todayStr(),
  });
  const [eventError, setEventError] = useState<string | null>(null);
  const [eventSaving, setEventSaving] = useState(false);

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

      const [{ data: emp }, { data: assign }, { data: membership }, { data: calEvents }] = await Promise.all([
        supabase.from("employees").select("id, name, color, course_member_id").eq("course_id", context.courseId),
        supabase.from("task_assignments").select("*").eq("course_id", context.courseId).eq("scheduled_date", todayStr()),
        supabase.from("course_members").select("id, role").eq("user_id", user.id).eq("course_id", context.courseId).maybeSingle(),
        supabase
          .from("calendar_events")
          .select("id, employee_id, event_type, title, start_date, end_date")
          .eq("course_id", context.courseId)
          .order("start_date", { ascending: true }),
      ]);
      setEmployees(emp ?? []);
      setTasks(assign ?? []);
      setMyRole(membership?.role ?? null);
      setMyEmployeeId((emp ?? []).find((e) => e.course_member_id === membership?.id)?.id ?? null);
      setCalendarEvents(calEvents ?? []);
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

  const isManager = myRole === "owner" || myRole === "superintendent";

  async function handleAddEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!courseId) return;
    if (!eventForm.title.trim()) {
      setEventError("Enter a title.");
      return;
    }
    if (eventForm.event_type === "time_off" && !eventForm.employee_id) {
      setEventError("Pick an employee for time off.");
      return;
    }
    if (eventForm.end_date < eventForm.start_date) {
      setEventError("End date can't be before the start date.");
      return;
    }
    setEventSaving(true);
    setEventError(null);
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("calendar_events")
      .insert({
        course_id: courseId,
        event_type: eventForm.event_type,
        employee_id: eventForm.event_type === "time_off" ? eventForm.employee_id : null,
        title: eventForm.title.trim(),
        start_date: eventForm.start_date,
        end_date: eventForm.end_date,
      })
      .select()
      .single();

    if (insertError) {
      setEventError(
        insertError.message.includes("row-level security policy")
          ? "You don't have permission to add calendar events. Ask an owner or superintendent."
          : insertError.message
      );
    } else if (data) {
      setCalendarEvents((prev) => [...prev, data].sort((a, b) => a.start_date.localeCompare(b.start_date)));
      setEventForm({ event_type: "special_event", employee_id: "", title: "", start_date: todayStr(), end_date: todayStr() });
      setShowAddEvent(false);
    }
    setEventSaving(false);
  }

  async function handleDeleteEvent(id: string) {
    const supabase = createClient();
    const { error: deleteError } = await supabase.from("calendar_events").delete().eq("id", id);
    if (!deleteError) {
      setCalendarEvents((prev) => prev.filter((e) => e.id !== id));
    }
  }

  function shiftMonth(delta: number) {
    const d = new Date(calendarYear, calendarMonth + delta, 1);
    setCalendarYear(d.getFullYear());
    setCalendarMonth(d.getMonth());
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

  const eventsInView = useMemo(() => {
    const monthStart = `${calendarYear}-${String(calendarMonth + 1).padStart(2, "0")}-01`;
    const monthEndDate = new Date(calendarYear, calendarMonth + 1, 0);
    const monthEnd = `${calendarYear}-${String(calendarMonth + 1).padStart(2, "0")}-${String(monthEndDate.getDate()).padStart(2, "0")}`;
    return calendarEvents.filter((e) => e.start_date <= monthEnd && e.end_date >= monthStart);
  }, [calendarEvents, calendarYear, calendarMonth]);

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

      {eventsInView.length > 0 && (
        <div className="bg-white border-[1.5px] border-rule rounded-[10px] overflow-hidden shrink-0">
          <div className="px-5 py-3 border-b-[1.5px] border-rule font-serif text-sm text-green-dark">This Month&apos;s Entries</div>
          <div className="divide-y divide-rule">
            {eventsInView.map((e) => {
              const emp = e.employee_id ? employees.find((emp2) => emp2.id === e.employee_id) : null;
              return (
                <div key={e.id} className="flex items-center gap-3 px-5 py-2.5 text-xs">
                  <span className="text-mist font-mono w-32 shrink-0">
                    {e.start_date === e.end_date ? e.start_date : `${e.start_date} — ${e.end_date}`}
                  </span>
                  {emp && (
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: emp.color ?? "#3b5bdb" }}
                    />
                  )}
                  <span className="flex-1 text-ink font-medium">
                    {emp ? `${emp.name} — ${e.title}` : e.title}
                  </span>
                  {isManager && (
                    <button onClick={() => handleDeleteEvent(e.id)} className="text-mist font-semibold hover:text-red shrink-0">
                      Delete
                    </button>
                  )}
                </div>
              );
            })}
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
                        <CleanupLapDirectionIcon direction={t.cleanup_lap_direction} />
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

      <div className="bg-white border-[1.5px] border-rule rounded-[10px] overflow-hidden shrink-0">
        <div className="px-5 py-4 border-b-[1.5px] border-rule flex items-center justify-between">
          <div>
            <div className="font-serif text-lg text-green-dark">Calendar</div>
            <div className="text-xs text-mist">Special events and employee time off — visible to the whole crew.</div>
          </div>
          {isManager && (
            <button
              onClick={() => setShowAddEvent((v) => !v)}
              className="px-3.5 py-1.5 bg-green-mid text-white text-xs font-semibold rounded-lg hover:bg-green-dark transition-colors shrink-0"
            >
              {showAddEvent ? "Cancel" : "+ Add to Calendar"}
            </button>
          )}
        </div>
        {showAddEvent && (
          <form onSubmit={handleAddEvent} className="flex flex-wrap items-end gap-2 px-5 py-4 border-b-[1.5px] border-rule bg-chalk">
            {eventError && <div className="w-full text-xs text-red">{eventError}</div>}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide">Type</label>
              <div className="flex gap-1 bg-white border-[1.5px] border-rule rounded-lg p-1">
                {(["special_event", "time_off"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setEventForm({ ...eventForm, event_type: t })}
                    className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                      eventForm.event_type === t ? "bg-green-pale text-green-mid" : "text-mist hover:text-ink"
                    }`}
                  >
                    {t === "special_event" ? "Special Event" : "Time Off"}
                  </button>
                ))}
              </div>
            </div>
            {eventForm.event_type === "time_off" && (
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wide">Employee</label>
                <select
                  value={eventForm.employee_id}
                  onChange={(e) => setEventForm({ ...eventForm, employee_id: e.target.value })}
                  className="w-36 px-2 py-2 border-[1.5px] border-rule rounded-lg text-sm"
                >
                  <option value="">Select employee</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex flex-col gap-1.5 flex-1 min-w-[140px]">
              <label className="text-[11px] font-semibold uppercase tracking-wide">Title</label>
              <input
                value={eventForm.title}
                onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
                placeholder={eventForm.event_type === "time_off" ? "Vacation" : "Member-Guest Tournament"}
                className="px-2 py-2 border-[1.5px] border-rule rounded-lg text-sm w-full"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide">Start</label>
              <input
                type="date"
                value={eventForm.start_date}
                onChange={(e) =>
                  setEventForm({
                    ...eventForm,
                    start_date: e.target.value,
                    end_date: eventForm.end_date < e.target.value ? e.target.value : eventForm.end_date,
                  })
                }
                className="px-2 py-2 border-[1.5px] border-rule rounded-lg text-sm"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide">End</label>
              <input
                type="date"
                value={eventForm.end_date}
                min={eventForm.start_date}
                onChange={(e) => setEventForm({ ...eventForm, end_date: e.target.value })}
                className="px-2 py-2 border-[1.5px] border-rule rounded-lg text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={eventSaving}
              className="px-4 py-2 bg-green-mid text-white text-sm font-semibold rounded-lg hover:bg-green-dark transition-colors disabled:opacity-50"
            >
              {eventSaving ? "Saving..." : "Save"}
            </button>
          </form>
        )}
      </div>

      <MonthCalendar
        year={calendarYear}
        month={calendarMonth}
        events={calendarEvents}
        employees={employees}
        onPrevMonth={() => shiftMonth(-1)}
        onNextMonth={() => shiftMonth(1)}
      />

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
