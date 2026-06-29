import LiveDot from "@/components/ui/LiveDot";
import AlertBanner from "@/components/ui/AlertBanner";
import StatChip from "@/components/ui/StatChip";

export default function FertilityPage() {
  return (
    <>
      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-green-forest mb-1">
          Fertility Program
        </div>
        <div className="font-serif text-2xl text-green-dark">
          Annual Nutrient Management
        </div>
        <div className="text-[13px] text-mist mt-1">
          Pebble Creek GC · Bermudagrass · 2026 Program Year
        </div>
      </div>

      <AlertBanner
        variant="amber"
        icon="⚠️"
        title="Iron (Fe) Deficiency — Greens · Soil test: 42 ppm (target 80–120 ppm)"
        body="Recommend foliar iron application this week: 2 oz/M chelated iron (EDTA). Do not apply above 90°F canopy temp."
      />

      <div className="grid grid-cols-4 gap-3">
        <StatChip label="N Applied YTD" value="2.8" unit="lbs/M" sub="Target: 6.0 lbs/M season" tag="47% of annual" tagColor="ok" valueColor="#2d6a4f" />
        <StatChip label="Next Application" value="Jul 1" sub="Greens · 0.2 lbs N/M spoon-feed" tag="6 days" tagColor="blue" />
        <StatChip label="Fertility Spend YTD" value="$4,820" sub="Budget: $12,400 annual" tag="On track" tagColor="ok" />
        <StatChip label="Soil Tests" value="4" unit="zones" sub="Last test: March 14, 2026" tag="Due for retest" tagColor="amber" />
      </div>

      <div className="bg-white border-[1.5px] border-rule rounded-[10px] p-6 text-center">
        <div className="text-4xl mb-3">🌱</div>
        <div className="font-serif text-xl text-green-dark mb-2">
          Nutrient status, soil tests, and annual program details
        </div>
        <div className="text-sm text-mist max-w-md mx-auto">
          Full nutrient grid and application schedule will be connected to live data in the next phase.
        </div>
      </div>
    </>
  );
}
