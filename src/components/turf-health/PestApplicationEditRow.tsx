"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { COURSE_AREAS } from "@/lib/areas";
import { reconcileStockForEdit, reconcileExpenseForEdit } from "@/lib/applicationEdits";
import { CATEGORY_TO_BUDGET_NAME, type ProductCategory } from "@/lib/pestCategorization";
import QuantityInput from "@/components/ui/QuantityInput";
import CurrencyInput from "@/components/ui/CurrencyInput";

export interface PestApplicationRow {
  id: string;
  applied_at: string;
  target: string | null;
  area: string | null;
  product: string;
  product_id: string | null;
  rei_hours: number;
  cost: number | null;
  quantity_used: number | null;
  notes: string | null;
  category: string | null;
}

function toLocalDatetimeInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Shared inline edit row for any pest_applications-backed tab (Weed,
 * Insects, Disease Risk, Growth Regulators) — the 4 sections are otherwise
 * near-identical, so this avoids writing the same ~100 lines of edit UI +
 * save logic 4 times. The linked product/category is intentionally NOT
 * editable here — changing it would mean moving the row to a different
 * table/tab, which this pass doesn't support (delete and re-log via the
 * unified form instead if a line was miscategorized).
 */
export default function PestApplicationEditRow({
  app,
  resolvedCategory,
  products,
  colSpan,
  onCancel,
  onSaved,
}: {
  app: PestApplicationRow;
  resolvedCategory: ProductCategory;
  products: { id: string; current_stock: number; unit: string }[];
  colSpan: number;
  onCancel: () => void;
  onSaved: (updated: PestApplicationRow) => void;
}) {
  const [target, setTarget] = useState(app.target ?? "");
  const [area, setArea] = useState(app.area ?? "");
  const [appliedAt, setAppliedAt] = useState(toLocalDatetimeInput(app.applied_at));
  const [reiHours, setReiHours] = useState(String(app.rei_hours));
  const [quantityUsed, setQuantityUsed] = useState(app.quantity_used != null ? String(app.quantity_used) : "");
  const [cost, setCost] = useState(app.cost != null ? String(app.cost) : "");
  const [notes, setNotes] = useState(app.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const linkedProduct = app.product_id ? products.find((p) => p.id === app.product_id) : null;

  async function handleSave() {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const appliedAtIso = new Date(appliedAt).toISOString();
    const newQuantity = quantityUsed ? parseFloat(quantityUsed) : null;
    const newCost = cost ? parseFloat(cost) : null;

    const { error: updateError } = await supabase
      .from("pest_applications")
      .update({
        target: target || null,
        area: area || null,
        applied_at: appliedAtIso,
        rei_hours: reiHours ? parseInt(reiHours) : 0,
        quantity_used: newQuantity,
        cost: newCost,
        notes: notes || null,
      })
      .eq("id", app.id);

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    if (app.product_id && newQuantity !== app.quantity_used) {
      await reconcileStockForEdit(supabase, {
        oldProductId: app.product_id,
        oldQuantityUsed: app.quantity_used,
        newProductId: app.product_id,
        newQuantityUsed: newQuantity,
        products,
      });
    }

    if (newCost !== app.cost) {
      await reconcileExpenseForEdit({
        pestApplicationId: app.id,
        newCost,
        categoryName: CATEGORY_TO_BUDGET_NAME[resolvedCategory],
        description: `${app.product} — ${area}`,
        expenseDate: appliedAtIso.slice(0, 10),
        source: "application_pest",
      });
    }

    onSaved({
      ...app,
      target: target || null,
      area: area || null,
      applied_at: appliedAtIso,
      rei_hours: reiHours ? parseInt(reiHours) : 0,
      quantity_used: newQuantity,
      cost: newCost,
      notes: notes || null,
    });
    setSaving(false);
  }

  return (
    <tr className="border-b border-rule last:border-0 bg-chalk">
      <td colSpan={colSpan} className="px-5 py-3">
        {error && <div className="mb-2 text-xs text-red">{error}</div>}
        <div className="flex flex-wrap items-end gap-2">
          <div className="text-xs text-mist px-2 py-1.5">{app.product} (fixed)</div>
          {resolvedCategory !== "fertilizer" && (
            <input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="Target"
              className="w-32 px-2 py-1.5 border-[1.5px] border-rule rounded text-xs outline-none focus:border-green-mid"
            />
          )}
          <select
            value={area}
            onChange={(e) => setArea(e.target.value)}
            className="px-2 py-1.5 border-[1.5px] border-rule rounded text-xs outline-none focus:border-green-mid"
          >
            <option value="">Select area</option>
            {COURSE_AREAS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <input
            type="datetime-local"
            value={appliedAt}
            onChange={(e) => setAppliedAt(e.target.value)}
            className="px-2 py-1.5 border-[1.5px] border-rule rounded text-xs outline-none focus:border-green-mid"
          />
          <input
            type="number"
            value={reiHours}
            onChange={(e) => setReiHours(e.target.value)}
            placeholder="REI hrs"
            className="w-16 px-2 py-1.5 border-[1.5px] border-rule rounded text-xs outline-none focus:border-green-mid"
          />
          {linkedProduct && (
            <QuantityInput
              value={quantityUsed}
              onChange={setQuantityUsed}
              unit={linkedProduct.unit}
              className="w-28"
            />
          )}
          <CurrencyInput value={cost} onChange={setCost} compact className="w-20" />
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes"
            className="w-32 px-2 py-1.5 border-[1.5px] border-rule rounded text-xs outline-none focus:border-green-mid"
          />
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-green-mid text-xs font-semibold hover:text-green-dark disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          <button onClick={onCancel} className="text-mist text-xs font-semibold hover:text-ink">
            Cancel
          </button>
        </div>
      </td>
    </tr>
  );
}
