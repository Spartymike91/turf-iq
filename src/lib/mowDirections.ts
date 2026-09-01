// Shared mow-direction options, using the clock-hour convention turf crews
// already use to describe a mowing pattern (e.g. "mow the 3-9 today").
export const MOW_DIRECTIONS = [
  { value: "straight", label: "Straight (12–6)" },
  { value: "diagonal_lr", label: "Left to right (2–8)" },
  { value: "across", label: "Across (3–9)" },
  { value: "diagonal_rl", label: "Right to left (4–10)" },
  { value: "crosscut", label: "Crosscut" },
] as const;

export type MowDirection = (typeof MOW_DIRECTIONS)[number]["value"];
