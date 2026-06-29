import LiveDot from "@/components/ui/LiveDot";
import StatChip from "@/components/ui/StatChip";

export default function TasksPage() {
  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-green-forest mb-1">
            Superintendent Dashboard
          </div>
          <div className="font-serif text-2xl text-green-dark">
            Live Operations — Thursday, June 25, 2026
          </div>
          <div className="text-[13px] text-mist mt-1">
            <span className="inline-flex items-center gap-1">
              <LiveDot /> Real-time · Course opens 7:30 AM
            </span>
          </div>
        </div>
      </div>

      {/* Hero Stats */}
      <div className="bg-green-dark rounded-[10px] p-5 grid grid-cols-4 gap-5 items-center relative overflow-hidden">
        <div className="absolute -top-[60px] -right-[60px] w-[200px] h-[200px] rounded-full bg-green-bright/[0.06]" />
        <div className="text-center">
          <div className="text-[10px] font-mono uppercase tracking-wider text-white/45 mb-2">Tasks Complete</div>
          <div className="font-serif text-[34px] text-white leading-none mb-1">7</div>
          <div className="text-[11px] text-white/45">of 34 assigned today</div>
        </div>
        <div className="text-center">
          <div className="text-[10px] font-mono uppercase tracking-wider text-white/45 mb-2">In Progress</div>
          <div className="font-serif text-[34px] text-amber leading-none mb-1">11</div>
          <div className="text-[11px] text-white/45">active right now</div>
        </div>
        <div className="text-center">
          <div className="text-[10px] font-mono uppercase tracking-wider text-white/45 mb-2">Clocked In</div>
          <div className="font-serif text-[34px] text-white leading-none mb-1">5</div>
          <div className="text-[11px] text-white/45">of 9 scheduled</div>
        </div>
        <div className="text-center">
          <div className="text-[10px] font-mono uppercase tracking-wider text-white/45 mb-2">Overall Progress</div>
          <div className="relative w-[90px] h-[90px] mx-auto">
            <svg viewBox="0 0 90 90" width="90" height="90" style={{ transform: "rotate(-90deg)" }}>
              <circle cx="45" cy="45" r="36" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="8" />
              <circle cx="45" cy="45" r="36" fill="none" stroke="#52b788" strokeWidth="8" strokeLinecap="round" strokeDasharray="226.2" strokeDashoffset="179" />
            </svg>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
              <div className="font-mono text-lg font-bold text-white">21%</div>
              <div className="text-[9px] text-white/45 uppercase tracking-wide">Done</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-3">
        <StatChip label="Hours Today" value="37.8" unit="h" sub="Est. labor cost $789" tag="On budget" tagColor="ok" valueColor="#3b5bdb" />
        <StatChip label="OT Risk" value="2" unit="staff" sub="Marcus & Derek tracking OT" tag="Monitor" tagColor="amber" valueColor="#f59e0b" />
        <StatChip label="On Lunch" value="0" sub="Next window: 10:00 AM" tag="All active" tagColor="ok" />
        <StatChip label="Course Opens" value="7:30" sub="Setup tasks on track" tag="✓ On track" tagColor="ok" />
        <StatChip label="High Priority" value="3" unit="tasks" sub="Greens mow, fungicide, cups" tag="Action needed" tagColor="warn" valueColor="#dc2626" />
      </div>

      <div className="bg-white border-[1.5px] border-rule rounded-[10px] p-6 text-center">
        <div className="text-4xl mb-3">📋</div>
        <div className="font-serif text-xl text-green-dark mb-2">
          Crew live status, task scheduler, time clock, and payroll
        </div>
        <div className="text-sm text-mist max-w-md mx-auto">
          Full task management with employee assignments, time tracking, and payroll will be connected in the next phase.
        </div>
      </div>
    </>
  );
}
