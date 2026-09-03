"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { resolveCourseIdClient } from "@/lib/supabase/course-context";
import { COURSE_AREAS } from "@/lib/areas";
import { recordApplicationExpense } from "@/lib/applicationExpenses";
import { PRODUCT_CATEGORIES, CATEGORY_LABEL, CATEGORY_TO_BUDGET_NAME, type ProductCategory } from "@/lib/pestCategorization";
import QuantityInput from "@/components/ui/QuantityInput";
import CurrencyInput from "@/components/ui/CurrencyInput";

interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  unit: string;
  unit_cost: number | null;
  current_stock: number;
}

const emptyHeader = { area: "", applied_at: "", notes: "" };
const emptyLine = { productId: "", customName: "", category: "other" as ProductCategory, target: "", rei_hours: "", quantity_used: "", cost: "", n_lbs_per_1000: "" };

function toLocalDatetimeInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function resolveCategory(line: typeof emptyLine, products: Product[]): ProductCategory {
  const product = products.find((p) => p.id === line.productId);
  return product ? product.category : line.category;
}

export default function LogApplicationForm() {
  const [courseId, setCourseId] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [open, setOpen] = useState(false);
  const [header, setHeader] = useState(emptyHeader);
  const [lines, setLines] = useState([{ ...emptyLine }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const context = await resolveCourseIdClient(supabase);
      if (!context) return;
      setCourseId(context.courseId);

      const { data: prods } = await supabase
        .from("products")
        .select("id, name, category, unit, unit_cost, current_stock")
        .eq("course_id", context.courseId)
        .eq("is_active", true)
        .order("category")
        .order("name");
      setProducts(prods ?? []);
    }
    load();
  }, []);

  const productsByCategory = PRODUCT_CATEGORIES.map((cat) => ({
    category: cat,
    products: products.filter((p) => p.category === cat),
  })).filter((g) => g.products.length > 0);

  function updateLine(index: number, patch: Partial<typeof emptyLine>) {
    setLines((prev) =>
      prev.map((l, i) => {
        if (i !== index) return l;
        const next = { ...l, ...patch };
        if ("productId" in patch || "quantity_used" in patch) {
          const product = products.find((p) => p.id === next.productId);
          const qty = parseFloat(next.quantity_used);
          if (product?.unit_cost != null && !Number.isNaN(qty)) {
            next.cost = (Number(product.unit_cost) * qty).toFixed(2);
          }
        }
        return next;
      })
    );
  }

  function addLine() {
    setLines((prev) => [...prev, { ...emptyLine, target: prev[prev.length - 1]?.target ?? "" }]);
  }

  function removeLine(index: number) {
    setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!courseId || !header.area) return;

    const validLines = lines.filter((l) => l.productId || l.customName);
    if (validLines.length === 0) return;

    // Fertilizer lines need a rate; custom (not-in-directory) lines need an
    // explicit category since there's no linked product to infer it from.
    for (const l of validLines) {
      const category = resolveCategory(l, products);
      if (category === "fertilizer" && !l.n_lbs_per_1000) {
        setError("Enter an N (lbs/1000) rate for every fertilizer line.");
        return;
      }
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    const supabase = createClient();
    const appliedAt = header.applied_at ? new Date(header.applied_at) : new Date();
    const appliedAtIso = appliedAt.toISOString();
    const applicationDate = appliedAtIso.slice(0, 10);

    type Insert = { line: (typeof emptyLine); category: ProductCategory; product: Product | undefined };
    const resolved: Insert[] = validLines.map((l) => ({
      line: l,
      category: resolveCategory(l, products),
      product: products.find((p) => p.id === l.productId),
    }));

    const fertilizerLines = resolved.filter((r) => r.category === "fertilizer");
    const otherLines = resolved.filter((r) => r.category !== "fertilizer");

    try {
      const insertedRows: { id: string; table: "fertilizer_applications" | "pest_applications"; category: ProductCategory; cost: number | null; product: string; productId: string | null; quantityUsed: number | null }[] = [];

      if (fertilizerLines.length > 0) {
        const rows = fertilizerLines.map(({ line, product }) => ({
          course_id: courseId,
          zone: header.area,
          product: product ? product.name : line.customName,
          product_id: product ? product.id : null,
          n_lbs_per_1000: parseFloat(line.n_lbs_per_1000),
          cost: line.cost ? parseFloat(line.cost) : null,
          quantity_used: product && line.quantity_used ? parseFloat(line.quantity_used) : null,
          application_date: applicationDate,
          notes: header.notes || null,
        }));
        const { data, error: insertError } = await supabase.from("fertilizer_applications").insert(rows).select();
        if (insertError) throw insertError;
        (data ?? []).forEach((row) =>
          insertedRows.push({
            id: row.id,
            table: "fertilizer_applications",
            category: "fertilizer",
            cost: row.cost,
            product: row.product,
            productId: row.product_id,
            quantityUsed: row.quantity_used,
          })
        );
      }

      if (otherLines.length > 0) {
        const rows = otherLines.map(({ line, category, product }) => ({
          course_id: courseId,
          applied_at: appliedAtIso,
          area: header.area,
          target: line.target || null,
          category,
          product: product ? product.name : line.customName,
          product_id: product ? product.id : null,
          rei_hours: line.rei_hours ? parseInt(line.rei_hours) : 0,
          cost: line.cost ? parseFloat(line.cost) : null,
          quantity_used: product && line.quantity_used ? parseFloat(line.quantity_used) : null,
          notes: header.notes || null,
        }));
        const { data, error: insertError } = await supabase.from("pest_applications").insert(rows).select();
        if (insertError) throw insertError;
        (data ?? []).forEach((row) =>
          insertedRows.push({
            id: row.id,
            table: "pest_applications",
            category: row.category ?? "other",
            cost: row.cost,
            product: row.product,
            productId: row.product_id,
            quantityUsed: row.quantity_used,
          })
        );
      }

      // Stock decrement — best-effort, same pattern as every existing section.
      for (const row of insertedRows) {
        if (row.productId && row.quantityUsed) {
          const product = products.find((p) => p.id === row.productId);
          if (product) {
            const newStock = Number(product.current_stock) - row.quantityUsed;
            const { error: stockError } = await supabase.from("products").update({ current_stock: newStock }).eq("id", row.productId);
            if (!stockError) {
              setProducts((prev) => prev.map((p) => (p.id === row.productId ? { ...p, current_stock: newStock } : p)));
            }
          }
        }
      }

      // Budget expense — one call per row, category resolved per line rather
      // than a single hardcoded constant for the whole batch.
      for (const row of insertedRows) {
        if (row.cost) {
          try {
            await recordApplicationExpense({
              categoryName: CATEGORY_TO_BUDGET_NAME[row.category],
              amount: Number(row.cost),
              description: `${row.product} — ${header.area}`,
              expenseDate: applicationDate,
              source: row.table === "fertilizer_applications" ? "application_fertilizer" : "application_pest",
              fertilizerApplicationId: row.table === "fertilizer_applications" ? row.id : undefined,
              pestApplicationId: row.table === "pest_applications" ? row.id : undefined,
            });
          } catch (expenseError) {
            console.error("Failed to record application expense:", expenseError);
          }
        }
      }

      const categoryCounts = new Map<string, number>();
      for (const row of insertedRows) {
        categoryCounts.set(row.category, (categoryCounts.get(row.category) ?? 0) + 1);
      }
      const summary = Array.from(categoryCounts.entries())
        .map(([cat, n]) => `${n} to ${CATEGORY_LABEL[cat as ProductCategory]}`)
        .join(", ");
      setNotice(`Logged ${insertedRows.length} product${insertedRows.length === 1 ? "" : "s"} — ${summary}. Switch tabs to see it reflected.`);
      setHeader(emptyHeader);
      setLines([{ ...emptyLine }]);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to log application.");
    }
    setSaving(false);
  }

  if (!courseId) return null;

  return (
    <div className="bg-white border-[1.5px] border-rule rounded-[10px] overflow-hidden shrink-0">
      <div className="flex items-center justify-between px-5 py-3.5">
        <div>
          <div className="font-serif text-base text-green-dark">Log Application</div>
          <div className="text-[11px] text-mist">One tank mix, any combination of products — each tracked to its own budget category.</div>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="px-3.5 py-1.5 bg-green-mid text-white text-xs font-semibold rounded-lg hover:bg-green-dark transition-colors shrink-0"
        >
          {open ? "Cancel" : "+ Log Application"}
        </button>
      </div>

      {notice && (
        <div className="mx-5 mb-3.5 bg-green-pale border-[1.5px] border-green-mid/40 rounded-lg px-4 py-2 text-xs text-green-dark">{notice}</div>
      )}

      {open && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 px-5 pb-4 pt-1 border-t-[1.5px] border-rule bg-chalk">
          {error && (
            <div className="bg-red/5 border-[1.5px] border-red/40 rounded-lg px-4 py-2 text-xs text-red">{error}</div>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide">Area</label>
              <select
                required
                value={header.area}
                onChange={(e) => setHeader({ ...header, area: e.target.value })}
                className="w-36 px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid"
              >
                <option value="" disabled>
                  Select area
                </option>
                {COURSE_AREAS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide">Applied At</label>
              <input
                type="datetime-local"
                value={header.applied_at}
                onChange={(e) => setHeader({ ...header, applied_at: e.target.value })}
                placeholder={toLocalDatetimeInput(new Date())}
                className="px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid"
              />
            </div>
            <div className="flex flex-col gap-1.5 flex-1 min-w-[140px]">
              <label className="text-[11px] font-semibold uppercase tracking-wide">Notes</label>
              <input
                type="text"
                value={header.notes}
                onChange={(e) => setHeader({ ...header, notes: e.target.value })}
                placeholder="Full course, spring program"
                className="px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid focus:ring-2 focus:ring-green-mid/10"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-semibold uppercase tracking-wide">
              Products <span className="text-mist font-normal normal-case">— log a tank mix in one pass, any combination of categories</span>
            </label>
            {lines.map((line, i) => {
              const linkedProduct = products.find((p) => p.id === line.productId);
              const category = resolveCategory(line, products);
              return (
                <div key={i} className="flex flex-wrap items-end gap-2 pb-2 border-b border-rule/60 last:border-0">
                  <select
                    value={line.productId}
                    onChange={(e) => updateLine(i, { productId: e.target.value })}
                    className="w-44 px-2 py-1.5 border-[1.5px] border-rule rounded text-xs outline-none focus:border-green-mid"
                  >
                    <option value="">— Custom / not in directory —</option>
                    {productsByCategory.map((g) => (
                      <optgroup key={g.category} label={CATEGORY_LABEL[g.category]}>
                        {g.products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  {!line.productId && (
                    <>
                      <input
                        required
                        value={line.customName}
                        onChange={(e) => updateLine(i, { customName: e.target.value })}
                        placeholder="Product name"
                        className="w-32 px-2 py-1.5 border-[1.5px] border-rule rounded text-xs outline-none focus:border-green-mid"
                      />
                      <select
                        value={line.category}
                        onChange={(e) => updateLine(i, { category: e.target.value as ProductCategory })}
                        className="px-2 py-1.5 border-[1.5px] border-rule rounded text-xs outline-none focus:border-green-mid"
                        title="Not in the product directory — pick its category so it's tracked and budgeted correctly"
                      >
                        {PRODUCT_CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {CATEGORY_LABEL[c]}
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                  {category !== "fertilizer" && (
                    <input
                      value={line.target}
                      onChange={(e) => updateLine(i, { target: e.target.value })}
                      placeholder="Target (optional)"
                      className="w-32 px-2 py-1.5 border-[1.5px] border-rule rounded text-xs outline-none focus:border-green-mid"
                    />
                  )}
                  <input
                    type="number"
                    value={line.rei_hours}
                    onChange={(e) => updateLine(i, { rei_hours: e.target.value })}
                    placeholder="REI hrs"
                    className="w-20 px-2 py-1.5 border-[1.5px] border-rule rounded text-xs outline-none focus:border-green-mid"
                  />
                  {category === "fertilizer" && (
                    <input
                      type="number"
                      step="0.001"
                      required
                      value={line.n_lbs_per_1000}
                      onChange={(e) => updateLine(i, { n_lbs_per_1000: e.target.value })}
                      placeholder="N lbs/M"
                      className="w-24 px-2 py-1.5 border-[1.5px] border-rule rounded text-xs outline-none focus:border-green-mid"
                    />
                  )}
                  {linkedProduct && (
                    <QuantityInput
                      value={line.quantity_used}
                      onChange={(v) => updateLine(i, { quantity_used: v })}
                      unit={linkedProduct.unit}
                      title={`Deducted from stock (currently ${linkedProduct.current_stock} ${linkedProduct.unit})`}
                      className="w-32"
                    />
                  )}
                  <CurrencyInput
                    value={line.cost}
                    onChange={(v) => updateLine(i, { cost: v })}
                    compact
                    className="w-24"
                  />
                  {lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLine(i)}
                      className="text-mist text-xs font-semibold hover:text-red"
                    >
                      Remove
                    </button>
                  )}
                </div>
              );
            })}
            <button
              type="button"
              onClick={addLine}
              className="self-start text-xs font-semibold text-green-mid hover:text-green-dark"
            >
              + Add Product
            </button>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="self-start px-4 py-2 bg-green-mid text-white text-sm font-semibold rounded-lg hover:bg-green-dark transition-colors disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </form>
      )}
    </div>
  );
}
