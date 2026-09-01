"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import FertilitySection from "@/components/turf-health/FertilitySection";
import PestWeedSection from "@/components/turf-health/PestWeedSection";
import DiseaseRiskSection from "@/components/turf-health/DiseaseRiskSection";

const SUB_TABS = [
  { slug: "fertility", label: "Fertility", icon: "🌱" },
  { slug: "pest-weed", label: "Pest & Weed", icon: "🧪" },
  { slug: "disease", label: "Disease Risk", icon: "🦠" },
] as const;

type SubTab = (typeof SUB_TABS)[number]["slug"];

function isSubTab(value: string | null): value is SubTab {
  return SUB_TABS.some((t) => t.slug === value);
}

function TurfHealthContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromUrl = searchParams.get("tab");
  const activeTab: SubTab = isSubTab(fromUrl) ? fromUrl : "fertility";

  function selectTab(slug: SubTab) {
    router.replace(`/turf-health?tab=${slug}`, { scroll: false });
  }

  return (
    <>
      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-green-forest mb-1">
          Turf Health
        </div>
        <div className="font-serif text-2xl text-green-dark">Fertility, Pest & Weed, Disease Risk</div>
      </div>

      <div className="flex gap-1 bg-white border-[1.5px] border-rule rounded-lg p-1 self-start">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.slug}
            type="button"
            onClick={() => selectTab(tab.slug)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-md text-sm font-semibold transition-colors ${
              activeTab === tab.slug ? "bg-green-mid text-white" : "text-mist hover:text-ink"
            }`}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "fertility" && <FertilitySection />}
      {activeTab === "pest-weed" && <PestWeedSection />}
      {activeTab === "disease" && <DiseaseRiskSection />}
    </>
  );
}

export default function TurfHealthPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center">
          <div className="text-mist">Loading...</div>
        </div>
      }
    >
      <TurfHealthContent />
    </Suspense>
  );
}
