import LiveDot from "@/components/ui/LiveDot";
import AlertBanner from "@/components/ui/AlertBanner";

const diseases = [
  { name: "Dollar Spot", idx: "0.74", risk: "HIGH", color: "text-red" },
  { name: "Brown Patch", idx: "0.48", risk: "MOD", color: "text-amber" },
  { name: "Pythium", idx: "0.18", risk: "LOW", color: "text-green-mid" },
  { name: "Anthracnose", idx: "0.12", risk: "LOW", color: "text-green-mid" },
  { name: "Take-All Patch", idx: "0.09", risk: "WATCH", color: "text-blue" },
];

export default function DiseasePage() {
  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-green-forest mb-1">
            Disease Risk Monitor
          </div>
          <div className="font-serif text-2xl text-green-dark">
            Turfgrass Disease Prediction
          </div>
          <div className="text-[13px] text-mist mt-1">
            Thursday June 25 · Bermudagrass ·{" "}
            <span className="inline-flex items-center gap-1">
              <LiveDot /> Models updated 6:42 AM
            </span>
          </div>
        </div>
      </div>

      <AlertBanner
        variant="red"
        icon="🚨"
        title="Dollar Spot — HIGH RISK · Apply preventive fungicide within 48 hours"
        body="Smith-Kerns index 0.74 (threshold 0.5). 18 days since last application — protection window expired on Bermudagrass. Visible symptoms likely within 4–6 days without treatment."
      />

      {/* Disease Tiles */}
      <div className="grid grid-cols-5 gap-2.5">
        {diseases.map((d) => (
          <div
            key={d.name}
            className={`bg-white border-[1.5px] border-rule rounded-lg p-3.5 text-center cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md ${
              d.name === "Dollar Spot"
                ? "border-green-mid bg-green-pale"
                : ""
            }`}
          >
            <div className="text-[11px] font-semibold text-ink mb-1.5">
              {d.name}
            </div>
            <div className={`font-mono text-xl font-semibold leading-none mb-1.5 ${d.color}`}>
              {d.idx}
            </div>
            <span
              className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded font-mono ${
                d.risk === "HIGH"
                  ? "bg-red/10 text-red"
                  : d.risk === "MOD"
                  ? "bg-amber/10 text-[#92400e]"
                  : d.risk === "WATCH"
                  ? "bg-blue/10 text-blue"
                  : "bg-green-pale text-green-mid"
              }`}
            >
              {d.risk}
            </span>
          </div>
        ))}
      </div>

      {/* Detail Card */}
      <div className="bg-white border-[1.5px] border-rule rounded-[10px] overflow-hidden">
        <div className="bg-green-dark p-5 grid grid-cols-[1fr_auto] gap-4 items-center">
          <div>
            <div className="font-serif text-xl text-white mb-1">Dollar Spot</div>
            <div className="text-[11px] text-white/50 italic mb-2.5">
              Clarireedia jacksonii · Clarireedia monteithiana
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {["Greens", "Tees", "Fairways"].map((z) => (
                <span
                  key={z}
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full font-mono bg-green-bright/20 text-green-bright border border-green-bright/30"
                >
                  {z}
                </span>
              ))}
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full font-mono bg-white/7 text-white/40 border border-white/10">
                Rough
              </span>
            </div>
          </div>
          <div className="text-center">
            <div className="relative w-[90px] h-[90px]">
              <svg
                viewBox="0 0 90 90"
                width="90"
                height="90"
                style={{ transform: "rotate(-90deg)" }}
              >
                <circle
                  cx="45"
                  cy="45"
                  r="36"
                  fill="none"
                  stroke="rgba(255,255,255,0.1)"
                  strokeWidth="8"
                />
                <circle
                  cx="45"
                  cy="45"
                  r="36"
                  fill="none"
                  stroke="#dc2626"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray="226.2"
                  strokeDashoffset="59"
                />
              </svg>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
                <div className="font-mono text-xl font-bold text-white leading-none">
                  0.74
                </div>
                <div className="text-[9px] text-white/45 uppercase tracking-wide mt-0.5">
                  Index
                </div>
              </div>
            </div>
            <div className="text-[10px] font-bold text-red mt-1 font-mono">
              ● HIGH RISK
            </div>
          </div>
        </div>
        <div className="p-5 grid grid-cols-2 gap-5">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-mist font-mono mb-2.5">
              Contributing Conditions
            </div>
            {[
              { name: "Leaf Wetness Duration", val: "9.2 hrs", flag: "TRIGGER", fc: "bg-red/10 text-red" },
              { name: "Overnight Low Temp", val: "71°F", flag: "TRIGGER", fc: "bg-red/10 text-red" },
              { name: "N Fertility", val: "Low", flag: "TRIGGER", fc: "bg-red/10 text-red" },
              { name: "Days Since Last App", val: "18 days", flag: "EXPIRED", fc: "bg-red/10 text-red" },
              { name: "Daytime High Temp", val: "90°F", flag: "OK", fc: "bg-green-pale text-green-mid" },
            ].map((f) => (
              <div
                key={f.name}
                className="flex items-center justify-between px-2.5 py-1.5 bg-chalk rounded mb-1.5 text-xs gap-2"
              >
                <span className="text-ink flex-1">{f.name}</span>
                <span className="font-mono font-semibold text-green-mid">{f.val}</span>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded font-mono whitespace-nowrap ${f.fc}`}>
                  {f.flag}
                </span>
              </div>
            ))}
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-mist font-mono mb-2.5">
              Recommendation
            </div>
            <div className="border-[1.5px] border-rule rounded-[7px] overflow-hidden">
              <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide bg-red/10 text-red">
                🚨 URGENT — Apply within 48 hours
              </div>
              <div className="p-3 text-xs text-ink leading-relaxed">
                Protection window expired. Visible symptoms likely within 4–6 days.
                <div className="flex items-start gap-1.5 px-2 py-1.5 bg-chalk rounded mt-1.5 text-[11px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-bright shrink-0 mt-1" />
                  <div className="flex-1">
                    <span className="font-semibold text-ink">Velista (penthiopyrad)</span>
                    <div className="text-[10px] text-mist">Systemic · 21-day window</div>
                  </div>
                  <span className="font-mono text-mist shrink-0">0.3 oz/M</span>
                </div>
                <div className="flex items-start gap-1.5 px-2 py-1.5 bg-chalk rounded mt-1.5 text-[11px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-bright shrink-0 mt-1" />
                  <div className="flex-1">
                    <span className="font-semibold text-ink">Daconil WeatherStik</span>
                    <div className="text-[10px] text-mist">Contact · broad spectrum</div>
                  </div>
                  <span className="font-mono text-mist shrink-0">4 fl oz/M</span>
                </div>
                <div className="mt-2 px-2.5 py-2 bg-amber/10 rounded text-[11px] text-[#92400e] font-medium border-l-[3px] border-amber">
                  ⏱ Apply Friday AM before 9 AM. Avoid evening application ahead of Saturday rain.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
