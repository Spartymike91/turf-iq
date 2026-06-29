import LiveDot from "@/components/ui/LiveDot";
import AlertBanner from "@/components/ui/AlertBanner";

export default function PestWeedPage() {
  return (
    <>
      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-green-forest mb-1">
          Pest & Weed Control
        </div>
        <div className="font-serif text-2xl text-green-dark">
          Integrated Pest Management
        </div>
        <div className="text-[13px] text-mist mt-1">
          1,847 GDD (Base 50°F) · Bermudagrass · Atlanta, GA
        </div>
      </div>

      <AlertBanner
        variant="amber"
        icon="🐛"
        title="White Grub (Masked Chafer) — Active Window · 1,847 GDD puts egg hatch at peak risk"
        body="Preventive imidacloprid window closed June 1. Curative options now apply. Scout fairways at dusk for adult activity."
      />

      <div className="bg-white border-[1.5px] border-rule rounded-[10px] p-6 text-center">
        <div className="text-4xl mb-3">🧪</div>
        <div className="font-serif text-xl text-green-dark mb-2">
          Pest pressure cards, GDD tracking, and spray compliance
        </div>
        <div className="text-sm text-mist max-w-md mx-auto">
          Full pest and weed pressure monitoring will be connected in the next phase.
        </div>
      </div>
    </>
  );
}
