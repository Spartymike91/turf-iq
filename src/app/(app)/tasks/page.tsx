"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import StatChip from "@/components/ui/StatChip";
import { computeWeeklyPayroll, hoursToday, getWeekStart } from "@/lib/payroll";

interface Employee {
  id: string;
  name: string;
  hourly_rate: number;
  is_active: boolean;
}

interface TimeEntry {
  employee_id: string;
  clock_in: string;
  clock_out: string | null;
}

interface TaskAssignment {
  id: string;
  priority: "low" | "normal" | "high";
  status: "not_started" | "in_progress" | "complete";
}

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function TasksDashboardPage() {
  const [courseId, setCourseId] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [tasksToday, setTasksToday] = useState<TaskAssignment[]>([]);
  const [checking, setChecking] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const weekStart = useMemo(() => getWeekStart(new Date()), []);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: membership } = await supabase
        .from("course_members")
        .select("course_id")
        .eq("user_id", user.id)
        .limit(1)
        .single();

      if (!membership?.course_id) {
        setChecking(false);
        return;
      }
      setCourseId(membership.course_id);

      const [{ data: emp }, { data: timeRows }, { data: tasks }] = await Promise.all([
        supabase.from("employees").select("id, name, hourly_rate, is_active").eq("course_id", membership.course_id),
        supabase
          .from("time_entries")
          .select("employee_id, clock_in, clock_out")
          .eq("course_id", membership.course_id)
          .gte("clock_in", weekStart.toISOString()),
        supabase
          .from("task_assignments")
          .select("id, priority, status")
          .eq("course_id", membership.course_id)
          .eq("scheduled_date", todayStr()),
      ]);
      setEmployees(emp ?? []);
      setEntries(timeRows ?? []);
      setTasksToday(tasks ?? []);
      setChecking(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeEmployees = employees.filter((e) => e.is_active);
  const clockedIn = entries.filter((e) => e.clock_out === null).length;
  const completeCount = tasksToday.filter((t) => t.status === "complete").length;
  const inProgressCount = tasksToday.filter((t) => t.status === "in_progress").length;
  const highPriorityOpen = tasksToday.filter((t) => t.priority === "high" && t.status !== "complete").length;
  const progressPct = tasksToday.length > 0 ? Math.round((completeCount / tasksToday.length) * 100) : 0;
  const hoursToday_ = hoursToday(entries, null, now);
  const payroll = useMemo(() => computeWeeklyPayroll(employees, entries, weekStart, now), [employees, entries, weekStart, now]);
  const otRiskCount = payroll.filter((p) => p.regularHours + p.otHours >= 35).length;
  const laborCostToday = activeEmployees.length > 0 ? hoursToday_ * (activeEmployees.reduce((s, e) => s + Number(e.hourly_rate), 0) / activeEmployees.length) : 0;

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

  const circumference = 2 * Math.PI * 36;
  const dashOffset = circumference * (1 - progressPct / 100);

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-green-forest mb-1">
            Superintendent Dashboard
          </div>
          <div className="font-serif text-2xl text-green-dark">
            Live Operations —{" "}
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </div>
        </div>
      </div>

      <div className="bg-green-dark rounded-[10px] p-5 grid grid-cols-4 gap-5 items-center relative overflow-hidden">
        <div className="absolute -top-[60px] -right-[60px] w-[200px] h-[200px] rounded-full bg-green-bright/[0.06]" />
        <div className="text-center">
          <div className="text-[10px] font-mono uppercase tracking-wider text-white/45 mb-2">Tasks Complete</div>
          <div className="font-serif text-[34px] text-white leading-none mb-1">{completeCount}</div>
          <div className="text-[11px] text-white/45">of {tasksToday.length} assigned today</div>
        </div>
        <div className="text-center">
          <div className="text-[10px] font-mono uppercase tracking-wider text-white/45 mb-2">In Progress</div>
          <div className="font-serif text-[34px] text-amber leading-none mb-1">{inProgressCount}</div>
          <div className="text-[11px] text-white/45">active right now</div>
        </div>
        <div className="text-center">
          <div className="text-[10px] font-mono uppercase tracking-wider text-white/45 mb-2">Clocked In</div>
          <div className="font-serif text-[34px] text-white leading-none mb-1">{clockedIn}</div>
          <div className="text-[11px] text-white/45">of {activeEmployees.length} active staff</div>
        </div>
        <div className="text-center">
          <div className="text-[10px] font-mono uppercase tracking-wider text-white/45 mb-2">Overall Progress</div>
          <div className="relative w-[90px] h-[90px] mx-auto">
            <svg viewBox="0 0 90 90" width="90" height="90" style={{ transform: "rotate(-90deg)" }}>
              <circle cx="45" cy="45" r="36" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="8" />
              <circle
                cx="45"
                cy="45"
                r="36"
                fill="none"
                stroke="#52b788"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={circumference.toFixed(1)}
                strokeDashoffset={dashOffset.toFixed(1)}
              />
            </svg>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
              <div className="font-mono text-lg font-bold text-white">{progressPct}%</div>
              <div className="text-[9px] text-white/45 uppercase tracking-wide">Done</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <StatChip
          label="Hours Today"
          value={hoursToday_.toFixed(1)}
          unit="h"
          sub={`Est. labor cost $${laborCostToday.toFixed(0)}`}
          valueColor="#3b5bdb"
        />
        <StatChip
          label="OT Risk"
          value={String(otRiskCount)}
          unit="staff"
          sub="At or above 35 hrs this week"
          tag={otRiskCount > 0 ? "Monitor" : "Clear"}
          tagColor={otRiskCount > 0 ? "amber" : "ok"}
        />
        <StatChip
          label="Clocked In"
          value={String(clockedIn)}
          sub={`of ${activeEmployees.length} active staff`}
          tag={clockedIn > 0 ? "Active" : "None yet"}
          tagColor={clockedIn > 0 ? "ok" : "blue"}
        />
        <StatChip
          label="High Priority"
          value={String(highPriorityOpen)}
          unit="tasks"
          sub="Open, not yet complete"
          tag={highPriorityOpen > 0 ? "Action needed" : "Clear"}
          tagColor={highPriorityOpen > 0 ? "warn" : "ok"}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <a
          href="/tasks/scheduler"
          className="bg-white border-[1.5px] border-rule rounded-[10px] p-5 hover:border-green-mid hover:-translate-y-0.5 transition-all"
        >
          <div className="text-2xl mb-2">🗓️</div>
          <div className="font-serif text-lg text-green-dark mb-1">Scheduler</div>
          <div className="text-xs text-mist">Assign tasks to crew for any date</div>
        </a>
        <a
          href="/tasks/library"
          className="bg-white border-[1.5px] border-rule rounded-[10px] p-5 hover:border-green-mid hover:-translate-y-0.5 transition-all"
        >
          <div className="text-2xl mb-2">📋</div>
          <div className="font-serif text-lg text-green-dark mb-1">Task Library</div>
          <div className="text-xs text-mist">Manage reusable task templates</div>
        </a>
        <a
          href="/tasks/status"
          className="bg-white border-[1.5px] border-rule rounded-[10px] p-5 hover:border-green-mid hover:-translate-y-0.5 transition-all"
        >
          <div className="text-2xl mb-2">📊</div>
          <div className="font-serif text-lg text-green-dark mb-1">Live Status</div>
          <div className="text-xs text-mist">Today&apos;s task board, by status</div>
        </a>
        <a
          href="/tasks/time-clock"
          className="bg-white border-[1.5px] border-rule rounded-[10px] p-5 hover:border-green-mid hover:-translate-y-0.5 transition-all"
        >
          <div className="text-2xl mb-2">⏱️</div>
          <div className="font-serif text-lg text-green-dark mb-1">Time Clock</div>
          <div className="text-xs text-mist">Clock crew in and out</div>
        </a>
        <a
          href="/tasks/payroll"
          className="bg-white border-[1.5px] border-rule rounded-[10px] p-5 hover:border-green-mid hover:-translate-y-0.5 transition-all col-span-2"
        >
          <div className="text-2xl mb-2">💵</div>
          <div className="font-serif text-lg text-green-dark mb-1">Payroll</div>
          <div className="text-xs text-mist">Current week hours and labor cost, computed from real time clock data</div>
        </a>
      </div>
    </>
  );
}
