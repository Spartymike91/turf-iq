// Shared grass-type options for the per-area course setup (Greens, Tees,
// Fairways, Rough) — replaces the old single course-wide grass_type field.
// Each area can carry more than one (e.g. bentgrass greens with a natural
// Poa annua population, or bermudagrass fairways overseeded with
// ryegrass), so these are stored as TEXT[] columns and picked with a
// multi-select toggle group rather than a single dropdown. No "Mixed"
// option here: that was only ever a stand-in for "more than one," which
// multi-select now answers directly.
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

/**
 * Resolves an area's grass types for display/model-gating: the per-area
 * array if it has anything in it, else the legacy single grass_type
 * wrapped in a one-element array (skipped if it's "Mixed", which isn't a
 * valid per-area answer), else empty. Centralized because `array || legacy`
 * is a real bug here — an empty array is truthy in JS, so that pattern
 * would never fall back.
 */
export function resolveGrassTypes(areaTypes: string[] | null | undefined, legacy: string | null | undefined): string[] {
  if (areaTypes && areaTypes.length > 0) return areaTypes;
  if (legacy && legacy !== "Mixed") return [legacy];
  return [];
}
