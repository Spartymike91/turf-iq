import type { CleanupLapDirection } from "@/lib/cleanupLapDirections";

// A looping arrow showing which way the cleanup lap (final perimeter pass)
// goes — mirrored for clockwise vs. counterclockwise. Visually distinct from
// MowDirectionIcon's straight-line arrows since a cleanup lap is a loop, not
// a pass direction.
export default function CleanupLapDirectionIcon({
  direction,
  size = 20,
}: {
  direction: CleanupLapDirection | null;
  size?: number;
}) {
  if (!direction) return null;

  const c = 10;
  const r = 7;
  // 0deg = top (12 o'clock), increasing degrees sweeps clockwise on screen —
  // same convention as MowDirectionIcon's toPoint helper.
  const toPoint = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return { x: c + Math.sin(rad) * r, y: c - Math.cos(rad) * r };
  };

  // Arc leaves an 80deg gap centered at the top, sweeping clockwise from
  // 40deg to 320deg (the long way, through 3/6/9 o'clock).
  const start = toPoint(40);
  const end = toPoint(320);
  const arcPath = `M ${start.x} ${start.y} A ${r} ${r} 0 1 1 ${end.x} ${end.y}`;

  // Arrowhead at the arc's leading end, pointing further along the sweep
  // direction. Tangent direction at angle deg for increasing-deg (clockwise)
  // travel is (cos(rad), sin(rad)); counterclockwise reverses it.
  const headDeg = direction === "clockwise" ? 320 : 40;
  const headPoint = toPoint(headDeg);
  const headRad = (headDeg * Math.PI) / 180;
  const tangent =
    direction === "clockwise"
      ? { x: Math.cos(headRad), y: Math.sin(headRad) }
      : { x: -Math.cos(headRad), y: -Math.sin(headRad) };
  const normal = { x: -tangent.y, y: tangent.x };
  const tip = { x: headPoint.x + tangent.x * 2.2, y: headPoint.y + tangent.y * 2.2 };
  const base1 = { x: headPoint.x - tangent.x * 1.3 + normal.x * 1.4, y: headPoint.y - tangent.y * 1.3 + normal.y * 1.4 };
  const base2 = { x: headPoint.x - tangent.x * 1.3 - normal.x * 1.4, y: headPoint.y - tangent.y * 1.3 - normal.y * 1.4 };

  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <path d={direction === "clockwise" ? arcPath : `M ${end.x} ${end.y} A ${r} ${r} 0 1 0 ${start.x} ${start.y}`} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <polygon points={`${tip.x},${tip.y} ${base1.x},${base1.y} ${base2.x},${base2.y}`} fill="currentColor" />
    </svg>
  );
}
