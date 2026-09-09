// Shared CSV row validation/normalization for bulk-importing historical
// fertilizer/pest applications. No Next-specific imports — this file runs
// unchanged in the browser (import preview) and on the server (authoritative
// re-validation before any DB write), so the two can never disagree about
// what counts as a valid row.

import { COURSE_AREAS, type CourseArea } from "@/lib/areas";
import { PRODUCT_CATEGORIES, CATEGORY_LABEL, type ProductCategory } from "@/lib/pestCategorization";

export const IMPORT_CSV_HEADERS = [
  "date",
  "area",
  "category",
  "product_name",
  "target",
  "rate_n_lbs_per_1000",
  "quantity_used",
  "cost",
  "rei_hours",
  "notes",
] as const;

export type ImportCsvHeader = (typeof IMPORT_CSV_HEADERS)[number];
export type RawImportRow = Partial<Record<ImportCsvHeader, string>>;

export const IMPORT_CSV_TEMPLATE = [
  IMPORT_CSV_HEADERS.join(","),
  "2023-04-15,Greens,fertilizer,18-3-18 Fairway Fertilizer,,0.25,50,125.00,,Spring greens feeding",
  "2023-06-02,Greens,fungicide,Daconil Ultrex,Dollar Spot,,10,340.00,24,Preventative program",
].join("\n");

// Maximum data rows accepted per import — a sane ceiling for a single
// course's realistic worst case (several years, several categories) while
// keeping the client preview and server route's payload/runtime bounded.
export const IMPORT_MAX_ROWS = 5000;

export interface NormalizedImportRow {
  date: string; // YYYY-MM-DD
  area: CourseArea;
  category: ProductCategory;
  productName: string;
  target: string | null;
  rateNPer1000: number | null;
  quantityUsed: number | null;
  cost: number | null;
  reiHours: number | null;
  notes: string | null;
}

export interface ValidatedImportRow {
  index: number;
  ok: boolean;
  errors: string[];
  warnings: string[];
  normalized: NormalizedImportRow | null;
}

export interface ProductLookupItem {
  id: string;
  name: string;
  category: ProductCategory;
}

// Best-effort match only, scoped to the row's own category (so there's no
// category-conflict case to resolve) — never fuzzy, never auto-creates a
// product directory entry. Shared by the client preview and the server
// route so a row can't show "Matched" in the preview and then link a
// different (or no) product on actual import.
export function matchProductByName(
  products: ProductLookupItem[],
  name: string,
  category: ProductCategory
): ProductLookupItem | null {
  const key = name.trim().toLowerCase();
  return products.find((p) => p.category === category && p.name.trim().toLowerCase() === key) ?? null;
}

function normalizeKey(s: string): string {
  return s.trim().toLowerCase();
}

export function normalizeArea(raw: string | undefined): CourseArea | null {
  if (!raw) return null;
  const key = normalizeKey(raw);
  return COURSE_AREAS.find((a) => a.toLowerCase() === key) ?? null;
}

export function normalizeCategory(raw: string | undefined): ProductCategory | null {
  if (!raw) return null;
  const key = normalizeKey(raw);
  const slugMatch = PRODUCT_CATEGORIES.find((c) => c === key);
  if (slugMatch) return slugMatch;
  const labelMatch = PRODUCT_CATEGORIES.find((c) => CATEGORY_LABEL[c].toLowerCase() === key);
  return labelMatch ?? null;
}

// Strict on purpose: only unambiguous formats, never a fallback to
// `new Date(string)`, whose parsing of ambiguous formats varies by JS
// engine and is exactly the kind of silent-corruption risk a historical
// financial-data importer can't afford.
export function parseImportDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();

  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return isValidYmd(Number(y), Number(m), Number(d)) ? `${y}-${m}-${d}` : null;
  }

  const usMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usMatch) {
    const [, mo, da, y] = usMatch;
    const month = Number(mo);
    const day = Number(da);
    if (!isValidYmd(Number(y), month, day)) return null;
    return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  return null;
}

function isValidYmd(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

function parseOptionalNumber(raw: string | undefined): { ok: boolean; value: number | null } {
  const s = (raw ?? "").trim();
  if (s === "") return { ok: true, value: null };
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return { ok: false, value: null };
  return { ok: true, value: n };
}

function todayYmd(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function validateImportRow(raw: RawImportRow, index: number): ValidatedImportRow {
  const errors: string[] = [];
  const warnings: string[] = [];

  const date = parseImportDate(raw.date);
  if (!date) errors.push("date: required, use YYYY-MM-DD or M/D/YYYY");
  else if (date > todayYmd()) errors.push("date: is in the future — check the year");

  const area = normalizeArea(raw.area);
  if (!area) errors.push(`area: required, must be one of ${COURSE_AREAS.join(", ")}`);

  const category = normalizeCategory(raw.category);
  if (!category) errors.push(`category: required, must be one of ${PRODUCT_CATEGORIES.join(", ")}`);

  const productName = (raw.product_name ?? "").trim();
  if (!productName) errors.push("product_name: required");

  const target = (raw.target ?? "").trim() || null;
  if (target && category === "fertilizer") {
    warnings.push("target: ignored for fertilizer rows");
  }

  const rate = parseOptionalNumber(raw.rate_n_lbs_per_1000);
  if (!rate.ok) errors.push("rate_n_lbs_per_1000: must be a non-negative number");
  if (category === "fertilizer" && rate.value === null) {
    errors.push("rate_n_lbs_per_1000: required for fertilizer rows");
  }

  const quantityUsed = parseOptionalNumber(raw.quantity_used);
  if (!quantityUsed.ok) errors.push("quantity_used: must be a non-negative number");

  const cost = parseOptionalNumber(raw.cost);
  if (!cost.ok) errors.push("cost: must be a non-negative number");

  const reiHoursRaw = parseOptionalNumber(raw.rei_hours);
  if (!reiHoursRaw.ok || (reiHoursRaw.value !== null && !Number.isInteger(reiHoursRaw.value))) {
    errors.push("rei_hours: must be a non-negative whole number");
  }
  if (raw.rei_hours && category === "fertilizer") {
    warnings.push("rei_hours: ignored for fertilizer rows");
  }

  const notes = (raw.notes ?? "").trim() || null;

  if (errors.length > 0 || !date || !area || !category || !productName) {
    return { index, ok: false, errors, warnings, normalized: null };
  }

  return {
    index,
    ok: true,
    errors,
    warnings,
    normalized: {
      date,
      area,
      category,
      productName,
      target: category === "fertilizer" ? null : target,
      rateNPer1000: category === "fertilizer" ? rate.value : null,
      quantityUsed: quantityUsed.value,
      cost: cost.value,
      reiHours: category === "fertilizer" ? null : (reiHoursRaw.value ?? 0),
      notes,
    },
  };
}
