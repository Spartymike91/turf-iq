// Pure GDD50 (base 50°F) threshold functions for turf pest/weed timing.
// No I/O — callers supply gddSeasonToDate from src/lib/weather.ts.

export interface PestStatus {
  stage: string;
  detail: string;
  elevated: boolean;
}

/**
 * Crabgrass (Digitaria spp.) pre-emergent herbicide timing.
 * 200 GDD50 = germination onset / pre-emergent window closing point —
 * independently confirmed by Purdue, Michigan State GDDTracker, and
 * UW-Madison turf extension. Germination continues through ~200–600 GDD50.
 */
export function getCrabgrassStatus(gdd: number): PestStatus {
  if (gdd < 200) {
    return {
      stage: "Pre-emergent window OPEN",
      detail: `${gdd.toFixed(0)} of 200 GDD50 — germination hasn't started. Pre-emergent herbicide still effective.`,
      elevated: false,
    };
  }
  if (gdd <= 600) {
    return {
      stage: "Germination ACTIVE",
      detail: `${gdd.toFixed(0)} GDD50 (germination window is 200–600). Pre-emergent window closing/closed — consider post-emergent control for breakthrough.`,
      elevated: true,
    };
  }
  return {
    stage: "Germination window mostly closed",
    detail: `${gdd.toFixed(0)} GDD50 — past the primary 200–600 germination window for this season.`,
    elevated: false,
  };
}

/**
 * White grub (Japanese beetle / masked chafer complex) treatment timing.
 * Guidance-range figures from industry turf-care sources, not primary
 * university extension — lower confidence than the crabgrass model.
 */
export function getWhiteGrubStatus(gdd: number): PestStatus {
  if (gdd < 1030) {
    return {
      stage: "Before preventive window",
      detail: `${gdd.toFixed(0)} of ~1,030 GDD50 — too early for preventive grub control to be worthwhile yet.`,
      elevated: false,
    };
  }
  if (gdd <= 2500) {
    return {
      stage: "Preventive window ACTIVE",
      detail: `${gdd.toFixed(0)} GDD50 (guidance range ~1,030–2,500) — preventive products (e.g. imidacloprid, chlorantraniliprole) should already be active in soil ahead of egg hatch.`,
      elevated: true,
    };
  }
  return {
    stage: "Too late for preventive",
    detail: `${gdd.toFixed(0)} GDD50 — past ~2,500 GDD50, grubs are likely too large for preventive chemistry; curative treatment needed if damage is present.`,
    elevated: true,
  };
}

/**
 * Annual Bluegrass Weevil (ABW) — Northeast/upper-Midwest cool-season-turf
 * pest (annual bluegrass, creeping bentgrass fairways). Only relevant for
 * cool-season grass types; gate rendering by course.grass_type.
 */
export function getAbwStatus(gdd: number): PestStatus {
  if (gdd < 125) {
    return {
      stage: "Before adult movement",
      detail: `${gdd.toFixed(0)} of ~125 GDD50 — overwintering adults not yet moving into short-mown turf.`,
      elevated: false,
    };
  }
  if (gdd < 175) {
    return {
      stage: "Adult movement / adulticide window",
      detail: `${gdd.toFixed(0)} GDD50 (~125–150 typical) — adults moving into fairways; best window for adulticide if scouting confirms activity.`,
      elevated: true,
    };
  }
  if (gdd < 350) {
    return {
      stage: "Egg-laying / early larvae",
      detail: `${gdd.toFixed(0)} GDD50 (~175+ egg-laying begins) — monitor for early instar larvae.`,
      elevated: true,
    };
  }
  return {
    stage: "Larvae emerged from stems",
    detail: `${gdd.toFixed(0)} GDD50 — past ~350 GDD50, larvae have likely emerged from stems into the thatch/soil interface.`,
    elevated: true,
  };
}

const COOL_SEASON_GRASSES = ["bentgrass", "poa annua", "mixed"];

export function isCoolSeasonGrass(grassType: string | null | undefined): boolean {
  if (!grassType) return false;
  return COOL_SEASON_GRASSES.includes(grassType.toLowerCase());
}
