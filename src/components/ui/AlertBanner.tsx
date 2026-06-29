export default function AlertBanner({
  variant,
  icon,
  title,
  body,
}: {
  variant: "red" | "amber" | "blue" | "green";
  icon: string;
  title: string;
  body: string;
}) {
  const classes = {
    red: "bg-red/5 border-[1.5px] border-red/40",
    amber: "bg-amber/5 border-[1.5px] border-amber/40",
    blue: "bg-blue/5 border-[1.5px] border-blue/40",
    green: "bg-green-pale border-[1.5px] border-green-bright",
  };

  const titleColors = {
    red: "text-[#991b1b]",
    amber: "text-[#92400e]",
    blue: "text-[#1e40af]",
    green: "text-green-mid",
  };

  return (
    <div className={`rounded-[7px] px-4 py-3 flex items-start gap-3 ${classes[variant]}`}>
      <span className="text-lg shrink-0 mt-px">{icon}</span>
      <div>
        <div className={`text-xs font-bold mb-0.5 ${titleColors[variant]}`}>
          {title}
        </div>
        <div className="text-[11px] text-mist leading-relaxed">{body}</div>
      </div>
    </div>
  );
}
