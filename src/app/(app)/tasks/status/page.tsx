"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { resolveCourseIdClient } from "@/lib/supabase/course-context";
import TaskCompleteModal from "@/components/tasks/TaskCompleteModal";
import MowDirectionIcon from "@/components/tasks/MowDirectionIcon";
import type { MowDirection } from "@/lib/mowDirections";
import CleanupLapDirectionIcon from "@/components/tasks/CleanupLapDirectionIcon";
import type { CleanupLapDirection } from "@/lib/cleanupLapDirections";
import type { WeatherResult } from "@/lib/weather";
import MonthCalendar, { type CalendarEvent, EVENT_COLORS } from "@/components/tasks/MonthCalendar";
import { formatMinutes } from "@/lib/taskDuration";

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
  status: "not_started" | "in_progress" | "paused" | "complete";
  estimated_minutes: number | null;
  started_at: string | null;
  completed_at: string | null;
  paused_at: string | null;
  paused_minutes: number | null;
  quality_rating: number | null;
  scheduled_date: string;
}

interface TimeEntry {
  id: string;
  employee_id: string;
  clock_in: string;
}

const STATUS_LABEL: Record<TaskAssignment["status"], string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  paused: "Paused",
  complete: "Complete",
};

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function TaskStatusPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [tasks, setTasks] = useState<TaskAssignment[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [viewDate, setViewDate] = useState(todayStr());
  const [checking, setChecking] = useState(true);
  const [courseId, setCourseId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [myEmployeeId, setMyEmployeeId] = useState<string | null>(null);

  const [completingTask, setCompletingTask] = useState<TaskAssignment | null>(null);
  const [weather, setWeather] = useState<WeatherResult | null>(null);
  const [upcoming, setUpcoming] = useState<TaskAssignment[]>([]);
  const [openEntries, setOpenEntries] = useState<TimeEntry[]>([]);
  const [clockLoading, setClockLoading] = useState(false);
  const [clockError, setClockError] = useState<string | null>(null);

  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const now = new Date();
  const [calendarYear, setCalendarYear] = useState(now.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(now.getMonth());
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const emptyEventForm = {
    event_type: "special_event" as "special_event" | "time_off",
    employee_id: "",
    title: "",
    start_date: todayStr(),
    end_date: todayStr(),
    color: null as string | null,
  };
  const [eventForm, setEventForm] = useState(emptyEventForm);
  const [eventError, setEventError] = useState<string | null>(null);
  const [eventSaving, setEventSaving] = useState(false);

  const [colorPicker, setColorPicker] = useState<{ dateStr: string; x: number; y: number } | null>(null);
  const colorPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!colorPicker) return;
    function handleClickOutside(e: MouseEvent) {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
        setColorPicker(null);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setColorPicker(null);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [colorPicker]);

  // Everything here is independent of which day is being viewed — only
  // runs once on mount. Today's/viewed-day's tasks and Upcoming are
  // deliberately NOT fetched here; see the viewDate-keyed effect below.
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

      const [{ data: emp }, { data: membership }, { data: calEvents }, { data: openTimeEntries }] = await Promise.all([
        supabase.from("employees").select("id, name, color, course_member_id").eq("course_id", context.courseId),
        supabase.from("course_members").select("id, role").eq("user_id", user.id).eq("course_id", context.courseId).maybeSingle(),
        supabase
          .from("calendar_events")
          .select("id, employee_id, event_type, title, start_date, end_date, color, is_quick_tag")
          .eq("course_id", context.courseId)
          .order("start_date", { ascending: true }),
        // At most one row per currently-clocked-in employee — cheap enough
        // to always fetch here rather than a second round-trip once
        // myEmployeeId is known below.
        supabase.from("time_entries").select("id, employee_id, clock_in").eq("course_id", context.courseId).is("clock_out", null),
      ]);
      setEmployees(emp ?? []);
      setMyRole(membership?.role ?? null);
      setMyEmployeeId((emp ?? []).find((e) => e.course_member_id === membership?.id)?.id ?? null);
      setCalendarEvents(calEvents ?? []);
      setOpenEntries(openTimeEntries ?? []);
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

  // Re-fetches whenever the viewed day changes (including the initial
  // mount, once courseId resolves above).
  useEffect(() => {
    if (!courseId) return;
    let cancelled = false;
    async function loadTasks() {
      setTasksLoading(true);
      const supabase = createClient();
      const [{ data: assign }, { data: future }] = await Promise.all([
        supabase.from("task_assignments").select("*").eq("course_id", courseId!).eq("scheduled_date", viewDate),
        supabase
          .from("task_assignments")
          .select("*")
          .eq("course_id", courseId!)
          .gt("scheduled_date", viewDate)
          .order("scheduled_date", { ascending: true })
          .limit(15),
      ]);
      if (cancelled) return;
      setTasks(assign ?? []);
      setUpcoming(future ?? []);
      setTasksLoading(false);
    }
    loadTasks();
    return () => {
      cancelled = true;
    };
  }, [courseId, viewDate]);

  const isViewingToday = viewDate === todayStr();

  function shiftViewDate(deltaDays: number) {
    const d = new Date(`${viewDate}T00:00:00`);
    d.setDate(d.getDate() + deltaDays);
    setViewDate(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    );
  }

  function canManage(task: TaskAssignment) {
    return myRole === "owner" || myRole === "superintendent" || task.assigned_to === myEmployeeId;
  }

  const isManager = myRole === "owner" || myRole === "superintendent";
  const myOpenEntry = myEmployeeId ? openEntries.find((e) => e.employee_id === myEmployeeId) ?? null : null;

  async function handleClockToggle() {
    setClockLoading(true);
    setClockError(null);
    try {
      const res = await fetch("/api/time-clock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: myOpenEntry ? "clock_out" : "clock_in" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setClockError(data.error || "Something went wrong.");
      } else if (myOpenEntry) {
        setOpenEntries((prev) => prev.filter((e) => e.id !== myOpenEntry.id));
      } else {
        setOpenEntries((prev) => [...prev, data.entry]);
      }
    } catch {
      setClockError("Something went wrong.");
    }
    setClockLoading(false);
  }

  function openEditEvent(event: CalendarEvent) {
    setEditingEventId(event.id);
    setEventForm({
      event_type: event.event_type,
      employee_id: event.employee_id ?? "",
      title: event.title,
      start_date: event.start_date,
      end_date: event.end_date,
      color: event.color,
    });
    setEventError(null);
    setShowAddEvent(true);
  }

  function closeEventForm() {
    setShowAddEvent(false);
    setEditingEventId(null);
    setEventForm(emptyEventForm);
    setEventError(null);
  }

  async function handleSaveEvent(e: React.FormEvent) {
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
    const payload = {
      event_type: eventForm.event_type,
      employee_id: eventForm.event_type === "time_off" ? eventForm.employee_id : null,
      title: eventForm.title.trim(),
      start_date: eventForm.start_date,
      end_date: eventForm.end_date,
      color: eventForm.color,
    };
    const { data, error: saveError } = editingEventId
      ? await supabase.from("calendar_events").update(payload).eq("id", editingEventId).select().single()
      : await supabase.from("calendar_events").insert({ course_id: courseId, ...payload }).select().single();

    if (saveError) {
      setEventError(
        saveError.message.includes("row-level security policy")
          ? `You don't have permission to ${editingEventId ? "edit" : "add"} calendar events. Ask an owner or superintendent.`
          : saveError.message
      );
    } else if (data) {
      setCalendarEvents((prev) =>
        (editingEventId ? prev.map((e) => (e.id === data.id ? data : e)) : [...prev, data]).sort((a, b) =>
          a.start_date.localeCompare(b.start_date)
        )
      );
      closeEventForm();
    }
    setEventSaving(false);
  }

  async function handleDeleteEvent(id: string) {
    setEventError(null);
    const supabase = createClient();
    const { error: deleteError } = await supabase.from("calendar_events").delete().eq("id", id);
    if (deleteError) {
      setEventError(
        deleteError.message.includes("row-level security policy")
          ? "You don't have permission to delete calendar events. Ask an owner or superintendent."
          : deleteError.message
      );
    } else {
      setCalendarEvents((prev) => prev.filter((e) => e.id !== id));
      if (editingEventId === id) closeEventForm();
    }
  }

  function handleDayRightClick(dateStr: string, x: number, y: number) {
    setColorPicker({ dateStr, x, y });
  }

  // The events currently occupying the day the color picker is open for —
  // drives whether the popup shows swatches (0 or 1 event) or the
  // "multiple entries" message (2+, ambiguous which to recolor).
  const colorPickerDayEvents = colorPicker
    ? calendarEvents.filter((e) => e.start_date <= colorPicker.dateStr && colorPicker.dateStr <= e.end_date)
    : [];

  async function handleQuickSetColor(color: string | null, colorName?: string) {
    if (!colorPicker || !courseId) return;
    const { dateStr } = colorPicker;
    const supabase = createClient();

    if (colorPickerDayEvents.length === 0) {
      const { data, error } = await supabase
        .from("calendar_events")
        .insert({
          course_id: courseId,
          event_type: "special_event",
          title: colorName ?? "Event",
          start_date: dateStr,
          end_date: dateStr,
          color,
          is_quick_tag: true,
        })
        .select()
        .single();
      if (!error && data) {
        setCalendarEvents((prev) => [...prev, data].sort((a, b) => a.start_date.localeCompare(b.start_date)));
      }
    } else if (colorPickerDayEvents.length === 1) {
      const target = colorPickerDayEvents[0];
      // Clearing a quick tag's color leaves nothing worth keeping (no
      // title, no details) — delete it outright rather than leaving an
      // invisible, list-hidden husk of a row behind. A "real" event
      // (made via the full form) keeps its color just nulled out.
      if (target.is_quick_tag && color === null) {
        const { error } = await supabase.from("calendar_events").delete().eq("id", target.id);
        if (!error) {
          setCalendarEvents((prev) => prev.filter((e) => e.id !== target.id));
        }
      } else {
        const { data, error } = await supabase.from("calendar_events").update({ color }).eq("id", target.id).select().single();
        if (!error && data) {
          setCalendarEvents((prev) => prev.map((e) => (e.id === data.id ? data : e)));
        }
      }
    }
    setColorPicker(null);
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

  async function handlePause(task: TaskAssignment) {
    try {
      const res = await fetch("/api/tasks/pause", {
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

  async function handleResume(task: TaskAssignment) {
    try {
      const res = await fetch("/api/tasks/resume", {
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
    // Quick color-tags (right-click, no real details) stay off this list —
    // the whole point is a fast, disposable marker, not another row to
    // manage alongside genuine special events and time off.
    return calendarEvents.filter((e) => !e.is_quick_tag && e.start_date <= monthEnd && e.end_date >= monthStart);
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
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-green-forest mb-1">Live Status</div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => shiftViewDate(-1)} className="text-mist hover:text-ink font-semibold px-1" aria-label="Previous day">
              ←
            </button>
            <div className="font-serif text-2xl text-green-dark">
              {isViewingToday
                ? "Today's Crew Board"
                : new Date(`${viewDate}T00:00:00`).toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })}
            </div>
            <button onClick={() => shiftViewDate(1)} className="text-mist hover:text-ink font-semibold px-1" aria-label="Next day">
              →
            </button>
            {!isViewingToday && (
              <button onClick={() => setViewDate(todayStr())} className="text-xs text-green-mid font-semibold hover:text-green-dark ml-1">
                Today
              </button>
            )}
          </div>
          <div className="text-[13px] text-mist mt-1">
            {tasks.filter((t) => t.status === "complete").length} of {tasks.length} complete
          </div>
        </div>
        {myEmployeeId && (
          <div className="flex flex-col items-end gap-1">
            {clockError && <div className="text-[11px] text-red">{clockError}</div>}
            <div className="flex items-center gap-2">
              {myOpenEntry && (
                <span className="text-xs text-mist">
                  🟢 Clocked in since{" "}
                  {new Date(myOpenEntry.clock_in).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                </span>
              )}
              <button
                onClick={handleClockToggle}
                disabled={clockLoading}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 ${
                  myOpenEntry ? "border-[1.5px] border-rule text-ink hover:border-red hover:text-red" : "bg-green-mid text-white hover:bg-green-dark"
                }`}
              >
                {clockLoading ? "..." : myOpenEntry ? "Clock Out" : "Clock In"}
              </button>
            </div>
          </div>
        )}
      </div>

      {weather && isViewingToday && (
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

      {tasksLoading ? (
        <div className="bg-white border-[1.5px] border-rule rounded-[10px] p-10 text-center">
          <div className="text-sm text-mist">Loading...</div>
        </div>
      ) : tasks.length === 0 ? (
        <div className="bg-white border-[1.5px] border-rule rounded-[10px] p-10 text-center">
          <div className="text-4xl mb-3">📋</div>
          <div className="text-sm text-mist">
            {isViewingToday ? "No tasks scheduled for today. Add some in the Scheduler." : "No tasks scheduled for this day."}
          </div>
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
                      <span
                        className={`text-[8px] font-bold px-1 py-0.5 rounded font-mono shrink-0 ${
                          t.status === "paused" ? "bg-amber-100 text-amber-900" : "bg-chalk text-mist"
                        }`}
                      >
                        {STATUS_LABEL[t.status].toUpperCase()}
                      </span>
                    </div>
                    {t.status === "paused" && t.paused_at && (
                      <div className="text-[10px] text-amber-800 mb-1">
                        ⏸ Paused since{" "}
                        {new Date(t.paused_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                      </div>
                    )}
                    {t.status === "complete" && t.started_at && t.completed_at && (
                      <div className="text-[10px] text-mist mb-1">
                        {t.estimated_minutes != null && `Target: ${formatMinutes(t.estimated_minutes)} · `}
                        Actual:{" "}
                        {formatMinutes(
                          Math.max(
                            0,
                            (new Date(t.completed_at).getTime() - new Date(t.started_at).getTime()) / 60000 -
                              Number(t.paused_minutes ?? 0)
                          )
                        )}
                      </div>
                    )}
                    {canManage(t) && (
                      <>
                        {t.status === "not_started" && (
                          <button onClick={() => advanceStatus(t)} className="text-green-mid font-semibold hover:text-green-dark">
                            Start →
                          </button>
                        )}
                        {t.status === "in_progress" && (
                          <span className="flex items-center gap-3">
                            <button onClick={() => handlePause(t)} className="text-amber-700 font-semibold hover:text-amber-900">
                              ⏸ Pause
                            </button>
                            <button onClick={() => openCompleteDialog(t)} className="text-green-mid font-semibold hover:text-green-dark">
                              Complete →
                            </button>
                          </span>
                        )}
                        {t.status === "paused" && (
                          <button onClick={() => handleResume(t)} className="text-amber-700 font-semibold hover:text-amber-900">
                            ▶ Resume
                          </button>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

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

      <div className="bg-white border-[1.5px] border-rule rounded-[10px] overflow-hidden shrink-0">
        <div className="px-5 py-4 border-b-[1.5px] border-rule flex items-center justify-between">
          <div>
            <div className="font-serif text-lg text-green-dark">Calendar</div>
            <div className="text-xs text-mist">Special events and employee time off — visible to the whole crew.</div>
          </div>
          {isManager && (
            <button
              onClick={() => {
                if (showAddEvent) {
                  closeEventForm();
                } else {
                  setEventForm(emptyEventForm);
                  setShowAddEvent(true);
                }
              }}
              className="px-3.5 py-1.5 bg-green-mid text-white text-xs font-semibold rounded-lg hover:bg-green-dark transition-colors shrink-0"
            >
              {showAddEvent ? "Cancel" : "+ Add to Calendar"}
            </button>
          )}
        </div>
        {showAddEvent && (
          <form onSubmit={handleSaveEvent} className="flex flex-wrap items-end gap-2 px-5 py-4 border-b-[1.5px] border-rule bg-chalk">
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
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide">Color</label>
              <div className="flex items-center gap-1.5 h-[38px]">
                <button
                  type="button"
                  onClick={() => setEventForm({ ...eventForm, color: null })}
                  title="No color"
                  aria-label="No color"
                  className={`w-6 h-6 rounded-full border-[1.5px] flex items-center justify-center text-mist text-xs ${
                    eventForm.color === null ? "border-ink" : "border-rule"
                  }`}
                >
                  ✕
                </button>
                {EVENT_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setEventForm({ ...eventForm, color: c.value })}
                    title={c.name}
                    aria-label={c.name}
                    className={`w-6 h-6 rounded-full border-[1.5px] ${eventForm.color === c.value ? "border-ink" : "border-rule"}`}
                    style={{ backgroundColor: c.value }}
                  />
                ))}
              </div>
            </div>
            <button
              type="submit"
              disabled={eventSaving}
              className="px-4 py-2 bg-green-mid text-white text-sm font-semibold rounded-lg hover:bg-green-dark transition-colors disabled:opacity-50"
            >
              {eventSaving ? "Saving..." : editingEventId ? "Update" : "Save"}
            </button>
          </form>
        )}
        {!showAddEvent && eventError && <div className="px-5 py-2.5 text-xs text-red border-b-[1.5px] border-rule">{eventError}</div>}
        {eventsInView.length > 0 && (
          <div>
            <div className="px-5 pt-3 pb-1 text-[10px] font-mono uppercase tracking-widest text-mist">
              This Month&apos;s Entries{isManager ? " — click Edit or Delete to manage" : ""}
            </div>
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
                      <span className="flex items-center gap-3 shrink-0">
                        <button onClick={() => openEditEvent(e)} className="text-mist font-semibold hover:text-ink">
                          Edit
                        </button>
                        <button onClick={() => handleDeleteEvent(e.id)} className="text-mist font-semibold hover:text-red">
                          Delete
                        </button>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <MonthCalendar
        year={calendarYear}
        month={calendarMonth}
        events={calendarEvents}
        employees={employees}
        onPrevMonth={() => shiftMonth(-1)}
        onNextMonth={() => shiftMonth(1)}
        onDayContextMenu={isManager ? handleDayRightClick : undefined}
      />

      {colorPicker && (
        <div
          ref={colorPickerRef}
          className="fixed z-50 bg-white border-[1.5px] border-rule rounded-lg shadow-lg p-3"
          style={{ top: colorPicker.y, left: colorPicker.x }}
        >
          {colorPickerDayEvents.length > 1 ? (
            <div className="text-xs text-mist max-w-[180px]">
              This day has multiple entries — edit them in the list above.
            </div>
          ) : (
            <>
              <div className="text-[10px] font-mono uppercase tracking-widest text-mist mb-2">
                {colorPickerDayEvents.length === 1 ? "Recolor this day" : "Color this day"}
              </div>
              <div className="flex items-center gap-1.5 mb-2">
                {EVENT_COLORS.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => handleQuickSetColor(c.value, c.name)}
                    title={c.name}
                    aria-label={c.name}
                    className="w-6 h-6 rounded-full border-[1.5px] border-rule hover:scale-110 transition-transform"
                    style={{ backgroundColor: c.value }}
                  />
                ))}
              </div>
              {colorPickerDayEvents.length === 1 && colorPickerDayEvents[0].color && (
                <button
                  onClick={() => handleQuickSetColor(null)}
                  className="text-xs text-mist font-semibold hover:text-red"
                >
                  Clear color
                </button>
              )}
            </>
          )}
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
