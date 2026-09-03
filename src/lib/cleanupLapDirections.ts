// Shared cleanup-lap-direction options — the direction crews mow the final
// perimeter pass on greens/tees/fairways/approaches, distinct from the
// interior mow_direction pattern (see mowDirections.ts).
export const CLEANUP_LAP_DIRECTIONS = [
  { value: "clockwise", label: "Clockwise" },
  { value: "counterclockwise", label: "Counterclockwise" },
] as const;

export type CleanupLapDirection = (typeof CLEANUP_LAP_DIRECTIONS)[number]["value"];
