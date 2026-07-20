"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { resolveCourseIdClient } from "@/lib/supabase/course-context";
import { computeWeeklyPayroll, getWeekStart } from "@/lib/payroll";

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

export default function PayrollPage() {
  const [courseId, setCourseId] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
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
      const context = await resolveCourseIdClient(supabase);

      if (!context) {
        setChecking(false);
        return;
      }
      setCourseId(context.courseId);

      const [{ data: emp }, { data: timeRows }] = await Promise.all([
        supabase.from("employees").select("id, name, hourly_rate, is_active").eq("course_id", context.courseId),
        supabase
          .from("time_entries")
          .select("employee_id, clock_in, clock_out")
          .eq("course_id", context.courseId)
          .gte("clock_in", weekStart.toISOString()),
      ]);
      setEmployees(emp ?? []);
      setEntries(timeRows ?? []);
      setChecking(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const payroll = useMemo(() => computeWeeklyPayroll(employees, entries, weekStart, now), [employees, entries, weekStart, now]);
  const weekTotal = payroll.reduce((sum, p) => sum + p.totalPay, 0);
  const weekHours = payroll.reduce((sum, p) => sum + p.regularHours + p.otHours, 0);

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

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  return (
    <>
      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-green-forest mb-1">Payroll</div>
        <div className="font-serif text-2xl text-green-dark">Current Week Labor Cost</div>
        <div className="text-[13px] text-mist mt-1">
          {weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} –{" "}
          {weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {weekHours.toFixed(1)} hrs ·{" "}
          <span className="font-semibold text-green-dark">${weekTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> total
        </div>
      </div>

      <div className="bg-white border-[1.5px] border-rule rounded-[10px] overflow-hidden shrink-0">
        <div className="px-5 py-4 border-b-[1.5px] border-rule font-serif text-lg text-green-dark">This Week, By Employee</div>
        {payroll.length === 0 ? (
          <div className="p-10 text-center">
            <div className="text-4xl mb-3">💵</div>
            <div className="text-sm text-mist">No active employees or time logged yet this week.</div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-mono uppercase tracking-wider text-mist border-b border-rule">
                <th className="text-left px-5 py-2.5 font-medium">Employee</th>
                <th className="text-left px-3 py-2.5 font-medium">Regular Hrs</th>
                <th className="text-left px-3 py-2.5 font-medium">OT Hrs</th>
                <th className="text-left px-3 py-2.5 font-medium">Regular Pay</th>
                <th className="text-left px-3 py-2.5 font-medium">OT Pay</th>
                <th className="text-left px-3 py-2.5 font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {payroll.map((p) => (
                <tr key={p.employeeId} className="border-b border-rule last:border-0">
                  <td className="px-5 py-2.5 font-medium">{p.name}</td>
                  <td className="px-3 py-2.5 font-mono">{p.regularHours.toFixed(2)}</td>
                  <td className="px-3 py-2.5 font-mono">
                    {p.otHours > 0 ? (
                      <span className="text-amber font-semibold">{p.otHours.toFixed(2)}</span>
                    ) : (
                      "0.00"
                    )}
                  </td>
                  <td className="px-3 py-2.5 font-mono">${p.regularPay.toFixed(2)}</td>
                  <td className="px-3 py-2.5 font-mono">{p.otPay > 0 ? `$${p.otPay.toFixed(2)}` : "—"}</td>
                  <td className="px-3 py-2.5 font-mono font-semibold text-green-dark">${p.totalPay.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
