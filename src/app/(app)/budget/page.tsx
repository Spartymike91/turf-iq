import StatChip from "@/components/ui/StatChip";

export default function BudgetPage() {
  return (
    <>
      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-green-forest mb-1">
          Budget & Reporting
        </div>
        <div className="font-serif text-2xl text-green-dark">
          Financial Overview
        </div>
        <div className="text-[13px] text-mist mt-1">
          Pebble Creek GC · FY 2026
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <StatChip label="Annual Budget" value="$680K" sub="Fiscal Year 2026" tag="Active" tagColor="ok" valueColor="#1a3a2a" />
        <StatChip label="YTD Spent" value="$312K" sub="46% of annual budget" tag="On track" tagColor="ok" />
        <StatChip label="Chemical" value="$48.2K" sub="Budget: $46,000" tag="5% over" tagColor="warn" valueColor="#dc2626" />
        <StatChip label="Cost per Round" value="$18.40" sub="vs. $19.20 budget" tag="Under budget" tagColor="ok" valueColor="#2d6a4f" />
      </div>

      <div className="bg-white border-[1.5px] border-rule rounded-[10px] p-6 text-center">
        <div className="text-4xl mb-3">📊</div>
        <div className="font-serif text-xl text-green-dark mb-2">
          Budget vs. actual, monthly trends, and forecasting
        </div>
        <div className="text-sm text-mist max-w-md mx-auto">
          Full budget breakdown with category details will be connected in the next phase.
        </div>
      </div>
    </>
  );
}
