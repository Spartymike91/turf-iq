const OT_THRESHOLD_HOURS = 40;
const OT_MULTIPLIER = 1.5;

export interface TimeEntryLike {
  employee_id: string;
  clock_in: string;
  clock_out: string | null;
}

export interface EmployeeLike {
  id: string;
  name: string;
  hourly_rate: number;
  is_active: boolean;
}

export interface WeeklyPay {
  employeeId: string;
  name: string;
  regularHours: number;
  otHours: number;
  regularPay: number;
  otPay: number;
  totalPay: number;
}

/** Monday (local) of the week containing `date`. */
export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // shift Sunday(0) back to previous Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function durationHours(entry: TimeEntryLike, now: number): number {
  const start = new Date(entry.clock_in).getTime();
  const end = entry.clock_out ? new Date(entry.clock_out).getTime() : now;
  return Math.max(0, (end - start) / (1000 * 60 * 60));
}

export function computeWeeklyPayroll(
  employees: EmployeeLike[],
  entries: TimeEntryLike[],
  weekStart: Date,
  now: number = Date.now()
): WeeklyPay[] {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  return employees
    .filter((e) => e.is_active)
    .map((emp) => {
      const empEntries = entries.filter((t) => {
        if (t.employee_id !== emp.id) return false;
        const start = new Date(t.clock_in).getTime();
        return start >= weekStart.getTime() && start < weekEnd.getTime();
      });
      const totalHours = empEntries.reduce((sum, t) => sum + durationHours(t, now), 0);
      const regularHours = Math.min(totalHours, OT_THRESHOLD_HOURS);
      const otHours = Math.max(0, totalHours - OT_THRESHOLD_HOURS);
      const rate = Number(emp.hourly_rate);
      const regularPay = regularHours * rate;
      const otPay = otHours * rate * OT_MULTIPLIER;
      return {
        employeeId: emp.id,
        name: emp.name,
        regularHours: Math.round(regularHours * 100) / 100,
        otHours: Math.round(otHours * 100) / 100,
        regularPay: Math.round(regularPay * 100) / 100,
        otPay: Math.round(otPay * 100) / 100,
        totalPay: Math.round((regularPay + otPay) * 100) / 100,
      };
    });
}

export function hoursToday(entries: TimeEntryLike[], employeeId: string | null, now: number = Date.now()): number {
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  return entries
    .filter((t) => (employeeId ? t.employee_id === employeeId : true) && new Date(t.clock_in).getTime() >= todayStart.getTime())
    .reduce((sum, t) => sum + durationHours(t, now), 0);
}
