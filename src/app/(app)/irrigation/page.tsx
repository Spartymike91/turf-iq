import LiveDot from "@/components/ui/LiveDot";
import AlertBanner from "@/components/ui/AlertBanner";
import StatChip from "@/components/ui/StatChip";

export default function IrrigationPage() {
  return (
    <>
      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-green-forest mb-1">
          Irrigation Management
        </div>
        <div className="font-serif text-2xl text-green-dark">
          Water & Soil Moisture
        </div>
        <div className="text-[13px] text-mist mt-1">
          ET-based scheduling ·{" "}
          <span className="inline-flex items-center gap-1">
            <LiveDot /> Sensors live
          </span>
        </div>
      </div>

      <AlertBanner
        variant="amber"
        icon="🏜️"
        title="Dry Spot Alert — Holes 7 & 14 Fairways · 16–17% VWC (target 22–28%)"
        body="Tonight's runtime increased by 4 min on affected heads. Consider daytime syringe cycles."
      />

      <div className="grid grid-cols-4 gap-3">
        <StatChip label="Tonight's ET Target" value="0.21" unit="in" sub="Full course replacement" tag="↑ Above avg" tagColor="warn" valueColor="#ea580c" />
        <StatChip label="7-Day Rainfall" value="0.34" unit="in" sub="Deficit: −0.46&quot; vs ET demand" tag="Moisture deficit" tagColor="warn" valueColor="#0369a1" />
        <StatChip label="Water Used — MTD" value="842K" unit="gal" sub="Budget: 1.2M gal / month" tag="70% of budget" tagColor="ok" valueColor="#0369a1" />
        <StatChip label="Avg Course VWC" value="24" unit="%" sub="Target: 22–30%" tag="In range" tagColor="ok" valueColor="#2d6a4f" />
      </div>

      <div className="bg-white border-[1.5px] border-rule rounded-[10px] p-6 text-center">
        <div className="text-4xl mb-3">💧</div>
        <div className="font-serif text-xl text-green-dark mb-2">
          Irrigation schedules and zone moisture maps
        </div>
        <div className="text-sm text-mist max-w-md mx-auto">
          Tonight&apos;s schedule and zone moisture status will be connected to live sensor data in the next phase.
        </div>
      </div>
    </>
  );
}
