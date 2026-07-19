"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { resolveCourseIdClient } from "@/lib/supabase/course-context";
import StatChip from "@/components/ui/StatChip";
import AlertBanner from "@/components/ui/AlertBanner";
import type { WeatherResult } from "@/lib/weather";

interface TaskToday {
  id: string;
  name: string;
  priority: "low" | "normal" | "high";
  status: "not_started" | "in_progress" | "complete";
  assigned_to: string | null;
  estimated_minutes: number | null;
}

interface EquipmentIssue {
  equipmentName: string;
  task: string;
  status: "OVERDUE" | "DUE SOON";
  hoursRemaining: number | null;
  daysRemaining: number | null;
}

interface Briefing {
  headline: string | null;
  focusItems: string[];
  weather: WeatherResult | null;
  tasksToday: TaskToday[];
  equipmentIssues: EquipmentIssue[];
  generatedAt: string;
}

interface Employee {
  id: string;
  name: string;
}

export default function DashboardPage() {
  const [courseId, setCourseId] = useState<string | null>(null);
  const [courseName, setCourseName] = useState("");
  const [checking, setChecking] = useState(true);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [tasks, setTasks] = useState<TaskToday[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [error, setError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadBriefing = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/briefing");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Unable to load today's briefing.");
      } else {
        setBriefing(data);
        setTasks(data.tasksToday ?? []);
        setError(null);
      }
    } catch {
      setError("Unable to load today's briefing.");
    }
  }, []);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const context = await resolveCourseIdClient(supabase);

      if (!context) {
        setChecking(false);
        return;
      }
      setCourseId(context.courseId);

      const [{ data: course }, { data: emp }] = await Promise.all([
        supabase.from("courses").select("name").eq("id", context.courseId).single(),
        supabase.from("employees").select("id, name").eq("course_id", context.courseId),
      ]);
      setCourseName(course?.name ?? "");
      setEmployees(emp ?? []);

      await loadBriefing();
      setChecking(false);
    }
    load();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function scheduleRefresh() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      loadBriefing();
    }, 1500);
  }

  async function toggleTask(task: TaskToday) {
    const completing = task.status !== "complete";
    const previous = tasks;
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: completing ? "complete" : "not_started" } : t))
    );

    const supabase = createClient();
    const updates = completing
      ? { status: "complete", completed_at: new Date().toISOString() }
      : { status: "not_started", completed_at: null };

    const { data, error: updateError } = await supabase
      .from("task_assignments")
      .update(updates)
      .eq("id", task.id)
      .select()
      .single();

    if (updateError) {
      setTasks(previous);
      setError(updateError.message);
    } else if (data) {
      setTasks((prev) => prev.map((t) => (t.id === data.id ? data : t)));
      scheduleRefresh();
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

  const weather = briefing?.weather ?? null;
  const equipmentIssues = briefing?.equipmentIssues ?? [];
  const openTasksCount = tasks.filter((t) => t.status !== "complete").length;
  const anyOverdueEquipment = equipmentIssues.some((i) => i.status === "OVERDUE");
  const anyDueSoonEquipment = equipmentIssues.some((i) => i.status === "DUE SOON");
  const dollarSpot = weather?.diseaseRisk.dollarSpot;
  const dollarSpotAboveThreshold = dollarSpot ? dollarSpot.probabilityPct >= dollarSpot.actionThresholdPct : false;
  const diseaseElevated = weather ? weather.diseaseRisk.pythium.elevated || weather.diseaseRisk.brownPatch.elevated : false;
  const highPriorityOpen = tasks.some((t) => t.priority === "high" && t.status !== "complete");

  let bannerVariant: "red" | "amber" | "blue" = "blue";
  if (anyOverdueEquipment || dollarSpotAboveThreshold) {
    bannerVariant = "red";
  } else if (anyDueSoonEquipment || diseaseElevated || highPriorityOpen) {
    bannerVariant = "amber";
  }

  return (
    <>
      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-green-forest mb-1">
          Daily Dashboard
        </div>
        <div className="font-serif text-2xl text-green-dark">
          {new Date().toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
          })}
        </div>
        <div className="text-[13px] text-mist mt-1">
          {courseName}
          {weather ? ` · ${weather.location.city}, ${weather.location.state}` : ""}
        </div>
      </div>

      {error && (
        <div className="bg-red/5 border-[1.5px] border-red/40 rounded-lg px-4 py-2 text-xs text-red">{error}</div>
      )}

      <AlertBanner
        variant={bannerVariant}
        icon={bannerVariant === "red" ? "⚠️" : bannerVariant === "amber" ? "⚠️" : "🌱"}
        title={briefing?.headline ?? "Today's briefing"}
        body="Generated by the AI Agronomist from today's live weather, disease risk, and task data."
      />

      <div className="grid grid-cols-4 gap-3">
        <StatChip
          label="Today's High"
          value={weather ? String(weather.current.highF) : "—"}
          unit="°F"
          sub={weather ? `Low ${weather.current.lowF}°F` : "Weather unavailable"}
        />
        <StatChip
          label="GDD Today"
          value={weather ? `+${weather.agronomics.gddToday.toFixed(1)}` : "—"}
          sub={weather ? `${weather.agronomics.gddSeasonToDate.toFixed(0)} season to date` : "—"}
          valueColor="#2d6a4f"
        />
        <StatChip
          label="Open Tasks Today"
          value={String(openTasksCount)}
          sub={`of ${tasks.length} scheduled`}
          tag={openTasksCount > 0 ? "Open" : "All done"}
          tagColor={openTasksCount > 0 ? "amber" : "ok"}
        />
        <StatChip
          label="Equipment Needing Attention"
          value={String(equipmentIssues.length)}
          sub={equipmentIssues.length > 0 ? "Overdue or due soon" : "All current"}
          tag={anyOverdueEquipment ? "Overdue" : equipmentIssues.length > 0 ? "Due soon" : "Clear"}
          tagColor={anyOverdueEquipment ? "warn" : equipmentIssues.length > 0 ? "amber" : "ok"}
        />
      </div>

      {weather && (
        <div>
          <div className="font-serif text-[17px] text-green-dark mb-3">7-Day Forecast</div>
          <div className="grid grid-cols-7 gap-2">
            {weather.forecast.map((day, i) => (
              <div
                key={i}
                className={`border-[1.5px] rounded-[7px] px-1.5 py-2.5 text-center ${
                  day.isToday ? "bg-green-dark border-green-dark" : "bg-white border-rule"
                }`}
              >
                <div
                  className={`text-[10px] font-semibold uppercase tracking-wide mb-1.5 ${
                    day.isToday ? "text-white/60" : "text-mist"
                  }`}
                >
                  {day.dow}
                </div>
                <div className="text-xl mb-1.5">{day.icon}</div>
                <div className={`text-sm font-bold ${day.isToday ? "text-white" : "text-ink"}`}>{day.hiF}°</div>
                <div className={`text-[11px] ${day.isToday ? "text-white/50" : "text-mist"}`}>{day.loF}°</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {briefing && briefing.focusItems.length > 0 && (
        <div className="bg-white border-[1.5px] border-rule rounded-[10px] p-5">
          <div className="font-serif text-lg text-green-dark mb-3">Today&apos;s Focus</div>
          <ul className="flex flex-col gap-2">
            {briefing.focusItems.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-ink">
                <span className="text-green-mid mt-0.5">•</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-white border-[1.5px] border-rule rounded-[10px] overflow-hidden">
        <div className="px-5 py-4 border-b-[1.5px] border-rule font-serif text-lg text-green-dark">
          Today&apos;s Tasks
        </div>
        {tasks.length === 0 ? (
          <div className="p-10 text-center text-sm text-mist">No tasks scheduled for today.</div>
        ) : (
          <div className="divide-y divide-rule">
            {tasks.map((t) => {
              const complete = t.status === "complete";
              return (
                <label
                  key={t.id}
                  className="flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-chalk"
                >
                  <input
                    type="checkbox"
                    checked={complete}
                    onChange={() => toggleTask(t)}
                    className="w-4 h-4 accent-[#2d6a4f]"
                  />
                  <span className={`flex-1 text-sm ${complete ? "text-mist line-through" : "text-ink"}`}>
                    {t.name}
                  </span>
                  <span className="text-xs text-mist">
                    {employees.find((e) => e.id === t.assigned_to)?.name ?? "Unassigned"}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded font-mono ${
                      t.priority === "high"
                        ? "bg-red/10 text-red"
                        : t.priority === "low"
                        ? "bg-blue/10 text-blue"
                        : "bg-green-pale text-green-mid"
                    }`}
                  >
                    {t.priority.toUpperCase()}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
