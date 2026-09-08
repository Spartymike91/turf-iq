export interface CalendarEvent {
  id: string;
  employee_id: string | null;
  event_type: "special_event" | "time_off";
  title: string;
  start_date: string;
  end_date: string;
}

interface EmployeeRef {
  id: string;
  name: string;
  color: string | null;
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Month-grid calendar showing course-wide special events and per-employee
// time off — a fresh UI pattern for this app (everything else is
// tables/cards), built specifically for Robert's yearly calendar request.
// Purely presentational: entry/edit/delete lives in the page that renders
// this, in a plain list below, since cramming controls into small day
// cells gets unreliable fast.
export default function MonthCalendar({
  year,
  month,
  events,
  employees,
  onPrevMonth,
  onNextMonth,
}: {
  year: number;
  month: number; // 0-11
  events: CalendarEvent[];
  employees: EmployeeRef[];
  onPrevMonth: () => void;
  onNextMonth: () => void;
}) {
  const firstOfMonth = new Date(year, month, 1);
  const firstWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  const gridStart = new Date(year, month, 1 - firstWeekday);

  const days = Array.from({ length: totalCells }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });

  const todayStr = toDateStr(new Date());

  function eventsForDate(dateStr: string) {
    return events.filter((e) => e.start_date <= dateStr && dateStr <= e.end_date);
  }

  function employeeFor(id: string | null) {
    return id ? employees.find((e) => e.id === id) : null;
  }

  return (
    <div className="bg-white border-[1.5px] border-rule rounded-[10px] overflow-hidden shrink-0">
      <div className="px-5 py-4 border-b-[1.5px] border-rule flex items-center justify-between">
        <button onClick={onPrevMonth} className="text-mist hover:text-ink font-semibold px-2" aria-label="Previous month">
          ←
        </button>
        <div className="font-serif text-lg text-green-dark">
          {firstOfMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </div>
        <button onClick={onNextMonth} className="text-mist hover:text-ink font-semibold px-2" aria-label="Next month">
          →
        </button>
      </div>
      <div className="grid grid-cols-7 border-b border-rule">
        {WEEKDAY_LABELS.map((w) => (
          <div key={w} className="text-center text-[10px] font-mono uppercase tracking-wider text-mist py-2">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d, i) => {
          const dateStr = toDateStr(d);
          const inMonth = d.getMonth() === month;
          const dayEvents = eventsForDate(dateStr);
          return (
            <div
              key={i}
              className={`min-h-[72px] border-b border-r border-rule last:border-r-0 p-1 flex flex-col gap-0.5 ${
                inMonth ? "bg-white" : "bg-chalk"
              }`}
            >
              <div
                className={`text-[10px] font-mono ${
                  dateStr === todayStr
                    ? "text-white bg-green-mid rounded-full w-4 h-4 flex items-center justify-center"
                    : inMonth
                      ? "text-ink"
                      : "text-mist"
                }`}
              >
                {d.getDate()}
              </div>
              {dayEvents.map((e) => {
                if (e.event_type === "special_event") {
                  return (
                    <div
                      key={e.id}
                      title={e.title}
                      className="text-[9px] leading-tight px-1 py-0.5 rounded bg-amber-100 text-amber-900 truncate"
                    >
                      {e.title}
                    </div>
                  );
                }
                const emp = employeeFor(e.employee_id);
                const color = emp?.color ?? "#3b5bdb";
                return (
                  <div
                    key={e.id}
                    title={`${emp?.name ?? "Employee"} — ${e.title}`}
                    className="text-[9px] leading-tight px-1 py-0.5 rounded truncate"
                    style={{ backgroundColor: `${color}22`, color, borderLeft: `2px solid ${color}` }}
                  >
                    {emp?.name ?? "Employee"}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
