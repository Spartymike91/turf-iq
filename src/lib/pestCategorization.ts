// Shared keyword/category heuristics for splitting the shared
// pest_applications table into Weed / Insects / Disease Risk / Growth
// Regulator sub-tabs. Disease Risk was the first carve-out (matches
// disease-related target text); Weed and Growth Regulator are the same idea
// for their respective categories. Insects is deliberately the catch-all
// remainder — anything that isn't a weed, disease, or growth regulator match
// still needs somewhere to show up rather than silently disappearing.

export const DISEASE_TARGET_KEYWORDS = [
  "dollar spot",
  "pythium",
  "brown patch",
  "large patch",
  "anthracnose",
  "fusarium patch",
  "microdochium",
  "spring dead spot",
];

export function isDiseaseTarget(target: string | null) {
  if (!target) return false;
  const t = target.toLowerCase();
  return DISEASE_TARGET_KEYWORDS.some((d) => t.includes(d));
}

export const WEED_TARGET_KEYWORDS = [
  "crabgrass",
  "nutsedge",
  "dandelion",
  "clover",
  "dallisgrass",
  "goosegrass",
  "poa annua",
  "annual bluegrass",
  "broadleaf",
  "spurge",
  "chickweed",
  "plantain",
  "bindweed",
  "thistle",
  "sedge",
  "henbit",
  "spurweed",
];

function isWeedTarget(target: string | null) {
  if (!target) return false;
  const t = target.toLowerCase();
  // "Annual Bluegrass Weevil" contains "annual bluegrass" — guard against
  // the insect model's name being misread as the Poa annua weed.
  if (t.includes("weevil") || t.includes("grub")) return false;
  return WEED_TARGET_KEYWORDS.some((k) => t.includes(k));
}

export function isWeedApplication(
  app: { target: string | null; product_id: string | null },
  products: { id: string; category: string }[]
) {
  if (isWeedTarget(app.target)) return true;
  const product = products.find((p) => p.id === app.product_id);
  return product?.category === "herbicide";
}

export const GROWTH_REGULATOR_TARGET_KEYWORDS = [
  "growth regulator",
  "pgr",
  "trinexapac",
  "primo",
  "paclobutrazol",
  "trimmit",
  "flurprimidol",
  "cutless",
  "prohexadione",
  "anuew",
  "proxy",
  "legacy",
];

function isGrowthRegulatorTarget(target: string | null) {
  if (!target) return false;
  const t = target.toLowerCase();
  return GROWTH_REGULATOR_TARGET_KEYWORDS.some((k) => t.includes(k));
}

export function isGrowthRegulatorApplication(
  app: { target: string | null; product_id: string | null },
  products: { id: string; category: string }[]
) {
  if (isGrowthRegulatorTarget(app.target)) return true;
  const product = products.find((p) => p.id === app.product_id);
  return product?.category === "growth_regulator";
}

// The full set of product/application categories, shared by the Inventory
// product form and the unified Log Application form's per-line category
// picker (for custom, not-in-directory lines) — one source of truth so the
// two never drift apart.
export const PRODUCT_CATEGORIES = ["fertilizer", "fungicide", "herbicide", "insecticide", "growth_regulator", "other"] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<ProductCategory, string> = {
  fertilizer: "Fertilizer",
  fungicide: "Fungicide",
  herbicide: "Herbicide",
  insecticide: "Insecticide",
  growth_regulator: "Growth Regulator",
  other: "Other",
};

// Maps a product/line category to the budget category name
// recordApplicationExpense expects. Centralized here so the unified log form
// and any future caller stay in sync with the budget category names.
export const CATEGORY_TO_BUDGET_NAME: Record<ProductCategory, "Fertilizer" | "Fungicides" | "Herbicides" | "Insecticides" | "Growth Regulators" | "Other"> = {
  fertilizer: "Fertilizer",
  fungicide: "Fungicides",
  herbicide: "Herbicides",
  insecticide: "Insecticides",
  growth_regulator: "Growth Regulators",
  other: "Other",
};
