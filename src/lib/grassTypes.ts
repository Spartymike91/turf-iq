// Shared grass-type options for the per-area course setup (Greens, Tees,
// Fairways, Rough) — replaces the old single course-wide grass_type field.
// No "Mixed" option here: each area now gets one real answer, since that's
// the whole point of asking per area instead of once for the course.
export const GRASS_TYPES = ["Bermudagrass", "Bentgrass", "Zoysiagrass", "Paspalum", "Poa annua"] as const;
export type GrassType = (typeof GRASS_TYPES)[number];

export const GRASS_TYPE_AREAS = ["greens", "tees", "fairways", "rough"] as const;
export type GrassTypeArea = (typeof GRASS_TYPE_AREAS)[number];

export const GRASS_TYPE_AREA_LABEL: Record<GrassTypeArea, string> = {
  greens: "Greens",
  tees: "Tees",
  fairways: "Fairways",
  rough: "Rough",
};

/**
 * Sensible starting grass type for a climate zone, used to pre-fill an
 * area's grass type only while it's still unset — never to overwrite an
 * explicit choice. Transition Zone intentionally has no default: that's
 * the zone this per-area feature exists for (e.g. bentgrass greens +
 * bermudagrass fairways), so it should stay fully manual.
 */
export function defaultGrassTypeForClimateZone(climateZone: string): GrassType | null {
  if (climateZone === "warm-humid" || climateZone === "warm-arid") return "Bermudagrass";
  if (climateZone === "cool-humid" || climateZone === "cool-arid") return "Bentgrass";
  return null;
}
