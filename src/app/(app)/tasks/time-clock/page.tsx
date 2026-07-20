"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { resolveCourseIdClient } from "@/lib/supabase/course-context";

interface Employee {
  id: string;
  name: string;
  initials: string;
  color: string;
  is_active: boolean;
}

interface TimeEntry {
  id: string;
  employee_id: string;
  clock_in: string;
  clock_out: string | null;
}

const todayStr = () => new Date().toISOString().slice(0, 10);

function formatDuration(ms: number) {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m`;
}

export default function TimeClockPage() {
  const [courseId, setCourseId] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
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

      const [{ data: emp }, { data: timeRows }] = await Promise.all([
        supabase.from("employees").select("id, name, initials, color, is_active").eq("course_id", context.courseId).eq("is_active", true).order("name"),
        supabase
          .from("time_entries")
          .select("*")
          .eq("course_id", context.courseId)
          .gte("clock_in", `${todayStr()}T00:00:00.000Z`)
          .order("clock_in", { ascending: false }),
      ]);
      setEmployees(emp ?? []);
      setEntries(timeRows ?? []);
      setChecking(false);
    }
    load();
  }, []);

  function activeEntryFor(employeeId: string) {
    return entries.find((e) => e.employee_id === employeeId && e.clock_out === null) ?? null;
  }

  async function handleClockIn(employeeId: string) {
    if (!courseId) return;
    setError(null);
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("time_entries")
      .insert({ course_id: courseId, employee_id: employeeId })
      .select()
      .single();
    if (insertError) {
      setError(insertError.message);
    } else if (data) {
      setEntries((prev) => [data, ...prev]);
      setNow(Date.now());
    }
  }

  async function handleClockOut(entryId: string) {
    const supabase = createClient();
    const { data, error: updateError } = await supabase
      .from("time_entries")
      .update({ clock_out: new Date().toISOString() })
      .eq("id", entryId)
      .select()
      .single();
    if (!updateError && data) {
      setEntries((prev) => prev.map((e) => (e.id === entryId ? data : e)));
      setNow(Date.now());
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

  return (
    <>
      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-green-forest mb-1">Time Clock</div>
        <div className="font-serif text-2xl text-green-dark">Crew Clock In / Out</div>
        <div className="text-[13px] text-mist mt-1">
          {entries.filter((e) => e.clock_out === null).length} of {employees.length} clocked in
        </div>
      </div>

      {error && (
        <div className="bg-red/5 border-[1.5px] border-red/40 rounded-lg px-4 py-2 text-xs text-red">{error}</div>
      )}

      <div className="bg-white border-[1.5px] border-rule rounded-[10px] overflow-hidden shrink-0">
        <div className="px-5 py-4 border-b-[1.5px] border-rule font-serif text-lg text-green-dark">Crew</div>
        {employees.length === 0 ? (
          <div className="p-10 text-center text-sm text-mist">No active employees. Add staff in Labor first.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-mono uppercase tracking-wider text-mist border-b border-rule">
                <th className="text-left px-5 py-2.5 font-medium">Employee</th>
                <th className="text-left px-3 py-2.5 font-medium">Status</th>
                <th className="text-left px-3 py-2.5 font-medium">Since</th>
                <th className="text-left px-3 py-2.5 font-medium">Duration</th>
                <th className="text-right px-5 py-2.5 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => {
                const active = activeEntryFor(emp.id);
                return (
                  <tr key={emp.id} className="border-b border-rule last:border-0">
                    <td className="px-5 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-semibold shrink-0"
                          style={{ backgroundColor: emp.color }}
                        >
                          {emp.initials}
                        </div>
                        <span>{emp.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded font-mono ${
                          active ? "bg-green-pale text-green-mid" : "bg-rule text-mist"
                        }`}
                      >
                        {active ? "CLOCKED IN" : "CLOCKED OUT"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-mist">
                      {active ? new Date(active.clock_in).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "—"}
                    </td>
                    <td className="px-3 py-2.5 font-mono">
                      {active ? formatDuration(now - new Date(active.clock_in).getTime()) : "—"}
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      {active ? (
                        <button onClick={() => handleClockOut(active.id)} className="px-3 py-1.5 bg-red/10 text-red text-xs font-semibold rounded-lg hover:bg-red/20 transition-colors">
                          Clock Out
                        </button>
                      ) : (
                        <button onClick={() => handleClockIn(emp.id)} className="px-3 py-1.5 bg-green-mid text-white text-xs font-semibold rounded-lg hover:bg-green-dark transition-colors">
                          Clock In
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="bg-white border-[1.5px] border-rule rounded-[10px] overflow-hidden shrink-0">
        <div className="px-5 py-4 border-b-[1.5px] border-rule font-serif text-lg text-green-dark">Today&apos;s Log</div>
        {entries.length === 0 ? (
          <div className="p-10 text-center text-sm text-mist">No time entries logged yet today.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-mono uppercase tracking-wider text-mist border-b border-rule">
                <th className="text-left px-5 py-2.5 font-medium">Employee</th>
                <th className="text-left px-3 py-2.5 font-medium">Clock In</th>
                <th className="text-left px-3 py-2.5 font-medium">Clock Out</th>
                <th className="text-left px-3 py-2.5 font-medium">Duration</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-rule last:border-0">
                  <td className="px-5 py-2.5 font-medium">{employees.find((emp) => emp.id === e.employee_id)?.name ?? "—"}</td>
                  <td className="px-3 py-2.5 text-mist">{new Date(e.clock_in).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</td>
                  <td className="px-3 py-2.5 text-mist">
                    {e.clock_out ? new Date(e.clock_out).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "—"}
                  </td>
                  <td className="px-3 py-2.5 font-mono">
                    {formatDuration((e.clock_out ? new Date(e.clock_out).getTime() : now) - new Date(e.clock_in).getTime())}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
