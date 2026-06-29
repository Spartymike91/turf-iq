import AlertBanner from "@/components/ui/AlertBanner";
import LiveDot from "@/components/ui/LiveDot";

export default function WeatherPage() {
  return (
    <>
      {/* Page Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-green-forest mb-1">
            Weather Intelligence
          </div>
          <div className="font-serif text-2xl text-green-dark">
            Thursday, June 25, 2026
          </div>
          <div className="text-[13px] text-mist mt-1">
            Atlanta, GA · Warm-Season Humid ·{" "}
            <span className="inline-flex items-center gap-1">
              <LiveDot /> Updated 6:42 AM
            </span>
          </div>
        </div>
      </div>

      {/* Alerts */}
      <AlertBanner
        variant="amber"
        icon="⚠️"
        title="Dollar Spot Risk HIGH — Smith-Kerns 0.74 · Apply fungicide within 48 hours"
        body="9.2 hrs leaf wetness + low N + temps 68–82°F. Bermudagrass greens and tees most susceptible. Protection window expired."
      />
      <AlertBanner
        variant="blue"
        icon="🌧️"
        title="1.2&quot; Rainfall Expected Saturday (60%) — Auto-suspend irrigation is ON"
        body="Radar tracking system ETA Saturday ~2 PM. No immediate threat today. Review Friday spray timing."
      />

      {/* Current + Agro Metrics */}
      <div className="grid grid-cols-2 gap-4">
        {/* Current Conditions */}
        <div className="bg-green-dark rounded-[10px] p-5 text-white relative overflow-hidden">
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/[0.04]" />
          <div className="text-[10px] font-mono uppercase tracking-wider text-white/50 mb-2">
            Current Conditions
          </div>
          <div className="font-serif text-[52px] leading-none mb-1">
            84<sup className="text-[22px]">°F</sup>
          </div>
          <div className="text-[15px] text-green-bright mb-3.5">☀️ Mostly Sunny</div>
          <div className="flex gap-3.5 flex-wrap">
            <span className="text-[11px] text-white/60">
              💧 <strong className="text-white">71%</strong> RH
            </span>
            <span className="text-[11px] text-white/60">
              💨 <strong className="text-white">8 mph</strong> SW
            </span>
            <span className="text-[11px] text-white/60">
              🌡 High <strong className="text-white">90°F</strong>
            </span>
            <span className="text-[11px] text-white/60">
              Low <strong className="text-white">72°F</strong>
            </span>
          </div>
        </div>

        {/* Agronomic Metrics */}
        <div className="grid grid-cols-2 gap-3">
          <AgroCard
            label="Today's ET"
            value="0.21"
            unit=" in"
            desc='Above 30-day avg of 0.17"'
            fill={65}
            color="var(--amber)"
          />
          <AgroCard
            label="Growing Degree Days"
            value="1,847"
            unit=" GDD"
            desc="Base 50°F · season to date · grub hatch active"
            fill={72}
            color="var(--gm)"
          />
          <AgroCard
            label="Leaf Wetness"
            value="9.2"
            unit=" hrs"
            desc="Overnight. Dollar Spot threshold: 8+ hrs"
            fill={78}
            color="var(--red)"
          />
          <AgroCard
            label="Soil Temp (4&quot;)"
            value="78"
            unit="°F"
            desc="Bermuda root zone · Pythium active >70°F"
            fill={60}
            color="var(--gm)"
          />
        </div>
      </div>

      {/* 7-Day Forecast */}
      <div>
        <div className="font-serif text-[17px] text-green-dark mb-3">
          7-Day Forecast
        </div>
        <div className="grid grid-cols-7 gap-2">
          <ForecastDay dow="Thu" icon="☀️" hi="90°" lo="72°" rain="20%" today />
          <ForecastDay dow="Fri" icon="⛅" hi="88°" lo="71°" rain="30%" badge="DISEASE" />
          <ForecastDay dow="Sat" icon="🌧️" hi="82°" lo="69°" rain="60% · 1.2&quot;" />
          <ForecastDay dow="Sun" icon="⛅" hi="84°" lo="70°" rain="25%" />
          <ForecastDay dow="Mon" icon="☀️" hi="91°" lo="73°" rain="10%" />
          <ForecastDay dow="Tue" icon="☀️" hi="93°" lo="74°" rain="5%" badge="HEAT" />
          <ForecastDay dow="Wed" icon="⛅" hi="89°" lo="72°" rain="20%" />
        </div>
      </div>
    </>
  );
}

function AgroCard({
  label,
  value,
  unit,
  desc,
  fill,
  color,
}: {
  label: string;
  value: string;
  unit: string;
  desc: string;
  fill: number;
  color: string;
}) {
  return (
    <div className="bg-white border-[1.5px] border-rule rounded-[7px] p-3.5">
      <div className="text-[10px] font-mono uppercase tracking-wider text-mist mb-1.5">
        {label}
      </div>
      <div className="font-mono text-2xl font-semibold text-green-mid leading-none">
        {value}
        <span className="text-xs font-normal text-mist">{unit}</span>
      </div>
      <div className="text-[11px] text-mist mt-1.5 leading-snug">{desc}</div>
      <div className="h-1 bg-rule rounded mt-2 overflow-hidden">
        <div
          className="h-full rounded transition-all duration-700"
          style={{ width: `${fill}%`, background: color }}
        />
      </div>
    </div>
  );
}

function ForecastDay({
  dow,
  icon,
  hi,
  lo,
  rain,
  today,
  badge,
}: {
  dow: string;
  icon: string;
  hi: string;
  lo: string;
  rain: string;
  today?: boolean;
  badge?: string;
}) {
  return (
    <div
      className={`border-[1.5px] rounded-[7px] px-1.5 py-2.5 text-center cursor-pointer transition-all ${
        today
          ? "bg-green-dark border-green-dark"
          : "bg-white border-rule hover:border-green-mid hover:-translate-y-px"
      }`}
    >
      <div
        className={`text-[10px] font-semibold uppercase tracking-wide mb-1.5 ${
          today ? "text-white/60" : "text-mist"
        }`}
      >
        {dow}
      </div>
      <div className="text-xl mb-1.5">{icon}</div>
      <div
        className={`text-sm font-bold ${today ? "text-white" : "text-ink"}`}
      >
        {hi}
      </div>
      <div className={`text-[11px] ${today ? "text-white/50" : "text-mist"}`}>
        {lo}
      </div>
      <div
        className={`text-[10px] font-mono font-semibold mt-1 ${
          today ? "text-blue/60" : "text-blue"
        }`}
      >
        {rain}
      </div>
      {badge && (
        <span className="text-[9px] font-bold bg-red/10 text-red rounded px-1 py-0.5 mt-1 inline-block">
          {badge}
        </span>
      )}
    </div>
  );
}
