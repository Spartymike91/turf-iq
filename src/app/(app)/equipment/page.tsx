import LiveDot from "@/components/ui/LiveDot";
import AlertBanner from "@/components/ui/AlertBanner";

export default function EquipmentPage() {
  return (
    <>
      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-green-forest mb-1">
          Equipment Management
        </div>
        <div className="font-serif text-2xl text-green-dark">
          Fleet & Service Tracking
        </div>
        <div className="text-[13px] text-mist mt-1">
          Pebble Creek GC ·{" "}
          <span className="inline-flex items-center gap-1">
            <LiveDot /> Live
          </span>
        </div>
      </div>

      <AlertBanner
        variant="red"
        icon="🔧"
        title="Greens Mower #1 — Hydraulic Service OVERDUE by 12 hours"
        body="Toro GreensMaster 3250-D · Last service: 487 hrs · Due: 500 hrs · Current: 512 hrs"
      />

      <div className="bg-white border-[1.5px] border-rule rounded-[10px] p-6 text-center">
        <div className="text-4xl mb-3">🔧</div>
        <div className="font-serif text-xl text-green-dark mb-2">
          Fleet inventory, service tracking, and replacement planning
        </div>
        <div className="text-sm text-mist max-w-md mx-auto">
          Equipment fleet cards and service intervals will be connected in the next phase.
        </div>
      </div>
    </>
  );
}
