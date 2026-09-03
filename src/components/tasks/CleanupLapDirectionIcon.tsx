import type { CleanupLapDirection } from "@/lib/cleanupLapDirections";

// A bold rotation arrow (like a refresh/sync glyph: ↻ / ↺) showing which way
// the cleanup lap (final perimeter pass) goes — deliberately a loop shape,
// not a straight line, since a cleanup lap goes around the edge rather than
// across the surface like MowDirectionIcon's pass patterns.
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
  // same convention as MowDirectionIcon.
  const toPoint = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return { x: c + Math.sin(rad) * r, y: c - Math.cos(rad) * r };
  };

  // A ~300deg loop with a 60deg gap at top-right, like a refresh icon.
  const clockwise = direction === "clockwise";
  const gapStartDeg = 330;
  const gapEndDeg = 30;
  const arcStart = toPoint(clockwise ? gapEndDeg : gapStartDeg);
  const arcEnd = toPoint(clockwise ? gapStartDeg : gapEndDeg);
  const arcPath = `M ${arcStart.x} ${arcStart.y} A ${r} ${r} 0 1 ${clockwise ? 1 : 0} ${arcEnd.x} ${arcEnd.y}`;

  // Bold arrowhead at the loop's leading end, angled along the tangent so it
  // reads as "still moving" in that rotational direction.
  const headDeg = clockwise ? gapStartDeg : gapEndDeg;
  const headPoint = toPoint(headDeg);
  const headRad = (headDeg * Math.PI) / 180;
  const tangent = clockwise
    ? { x: Math.cos(headRad), y: Math.sin(headRad) }
    : { x: -Math.cos(headRad), y: -Math.sin(headRad) };
  const normal = { x: -tangent.y, y: tangent.x };
  const tip = { x: headPoint.x + tangent.x * 3.2, y: headPoint.y + tangent.y * 3.2 };
  const base1 = { x: headPoint.x - tangent.x * 1.6 + normal.x * 2.6, y: headPoint.y - tangent.y * 1.6 + normal.y * 2.6 };
  const base2 = { x: headPoint.x - tangent.x * 1.6 - normal.x * 2.6, y: headPoint.y - tangent.y * 1.6 - normal.y * 2.6 };

  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <path d={arcPath} fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
      <polygon points={`${tip.x},${tip.y} ${base1.x},${base1.y} ${base2.x},${base2.y}`} fill="currentColor" />
    </svg>
  );
}
