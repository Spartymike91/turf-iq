// Shared keyword/category heuristics for splitting the shared
// pest_applications table into Weed / Insects / Disease Risk sub-tabs.
// Disease Risk was the first carve-out (matches disease-related target
// text); Weed is the same idea for weed control. Insects is deliberately
// the catch-all remainder — anything that isn't a weed or disease match
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

export function isDiseaseTarget(target: string) {
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

function isWeedTarget(target: string) {
  const t = target.toLowerCase();
  // "Annual Bluegrass Weevil" contains "annual bluegrass" — guard against
  // the insect model's name being misread as the Poa annua weed.
  if (t.includes("weevil") || t.includes("grub")) return false;
  return WEED_TARGET_KEYWORDS.some((k) => t.includes(k));
}

export function isWeedApplication(
  app: { target: string; product_id: string | null },
  products: { id: string; category: string }[]
) {
  if (isWeedTarget(app.target)) return true;
  const product = products.find((p) => p.id === app.product_id);
  return product?.category === "herbicide";
}
