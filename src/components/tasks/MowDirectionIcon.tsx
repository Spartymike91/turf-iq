import type { MowDirection } from "@/lib/mowDirections";

// Clock face with a real arrow (or two, for crosscut) showing which way to
// mow — the same clock-hour shorthand crews already use. Each line points
// toward the first hour in its label (e.g. "2-8" points to the 2).
export default function MowDirectionIcon({ direction, size = 20 }: { direction: MowDirection | null; size?: number }) {
  if (!direction) return null;

  const r = 9;
  const c = 10;
  const ticks = [0, 90, 180, 270].map((deg) => {
    const rad = (deg * Math.PI) / 180;
    const x1 = c + Math.sin(rad) * (r - 2);
    const y1 = c - Math.cos(rad) * (r - 2);
    const x2 = c + Math.sin(rad) * r;
    const y2 = c - Math.cos(rad) * r;
    return { x1, y1, x2, y2 };
  });

  // Line endpoints per pattern, expressed as clock-hour angle pairs — the
  // arrowhead points toward the first angle in each pair.
  const linesByDirection: Record<MowDirection, [number, number][]> = {
    straight: [[0, 180]],
    diagonal_lr: [[60, 240]],
    across: [[90, 270]],
    diagonal_rl: [[120, 300]],
    crosscut: [
      [60, 240],
      [120, 300],
    ],
  };

  const toPoint = (hourAngleDeg: number, radius = r - 1.5) => {
    const rad = (hourAngleDeg * Math.PI) / 180;
    return { x: c + Math.sin(rad) * radius, y: c - Math.cos(rad) * radius };
  };

  const arrowhead = (headDeg: number, tailDeg: number) => {
    const head = toPoint(headDeg);
    const tail = toPoint(tailDeg);
    const dx = head.x - tail.x;
    const dy = head.y - tail.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy;
    const ny = ux;
    const backX = head.x - ux * 3;
    const backY = head.y - uy * 3;
    return `${head.x},${head.y} ${backX + nx * 1.8},${backY + ny * 1.8} ${backX - nx * 1.8},${backY - ny * 1.8}`;
  };

  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <circle cx={c} cy={c} r={r} fill="none" stroke="currentColor" strokeWidth="1" opacity="0.4" />
      {ticks.map((t, i) => (
        <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke="currentColor" strokeWidth="1" opacity="0.4" />
      ))}
      {linesByDirection[direction].map(([a, b], i) => {
        const p1 = toPoint(a);
        const p2 = toPoint(b);
        return (
          <g key={i}>
            <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            <polygon points={arrowhead(a, b)} fill="currentColor" />
          </g>
        );
      })}
    </svg>
  );
}
