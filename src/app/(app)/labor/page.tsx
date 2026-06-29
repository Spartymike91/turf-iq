import StatChip from "@/components/ui/StatChip";

export default function LaborPage() {
  return (
    <>
      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-green-forest mb-1">
          Labor & Staffing
        </div>
        <div className="font-serif text-2xl text-green-dark">
          Crew Schedule & Overtime
        </div>
        <div className="text-[13px] text-mist mt-1">
          Week of June 23–29, 2026 · 9 staff scheduled
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <StatChip label="Scheduled Today" value="9" unit="staff" sub="All positions filled" tag="Fully staffed" tagColor="ok" />
        <StatChip label="Weekly Hours" value="338" unit="hrs" sub="Regular hours across crew" tag="On pace" tagColor="ok" valueColor="#3b5bdb" />
        <StatChip label="Overtime" value="18" unit="hrs" sub="1.5× · $513 OT cost" tag="Monitor" tagColor="warn" valueColor="#dc2626" />
        <StatChip label="Weekly Labor" value="$4,893" sub="Budget: $3,300/wk" tag="OT driving variance" tagColor="warn" />
      </div>

      <div className="bg-white border-[1.5px] border-rule rounded-[10px] p-6 text-center">
        <div className="text-4xl mb-3">👷</div>
        <div className="font-serif text-xl text-green-dark mb-2">
          Weekly schedule grid and overtime tracking
        </div>
        <div className="text-sm text-mist max-w-md mx-auto">
          Full crew scheduling with hour logging will be connected in the next phase.
        </div>
      </div>
    </>
  );
}
