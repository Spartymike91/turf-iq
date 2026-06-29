export default function StatChip({
  label,
  value,
  unit,
  sub,
  tag,
  tagColor = "ok",
  valueColor,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  tag?: string;
  tagColor?: "ok" | "warn" | "amber" | "blue";
  valueColor?: string;
}) {
  const tagClasses = {
    ok: "bg-green-pale text-green-mid",
    warn: "bg-red/10 text-red",
    amber: "bg-amber/10 text-[#92400e]",
    blue: "bg-blue/10 text-blue",
  };

  return (
    <div className="bg-white border-[1.5px] border-rule rounded-lg px-4 py-3.5">
      <div className="text-[10px] font-mono uppercase tracking-wider text-mist mb-1.5">
        {label}
      </div>
      <div
        className="font-mono text-[22px] font-semibold leading-none"
        style={valueColor ? { color: valueColor } : undefined}
      >
        {value}
        {unit && (
          <span className="text-xs font-normal text-mist"> {unit}</span>
        )}
      </div>
      {sub && <div className="text-[11px] text-mist mt-1">{sub}</div>}
      {tag && (
        <span
          className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded mt-1.5 font-mono ${tagClasses[tagColor]}`}
        >
          {tag}
        </span>
      )}
    </div>
  );
}
