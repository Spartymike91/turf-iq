"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { COURSE_AREAS } from "@/lib/areas";
import { reconcileStockForEdit, reconcileExpenseForEdit } from "@/lib/applicationEdits";
import QuantityInput from "@/components/ui/QuantityInput";
import CurrencyInput from "@/components/ui/CurrencyInput";

export interface FertilizerApplicationRow {
  id: string;
  zone: string;
  product: string;
  product_id: string | null;
  n_lbs_per_1000: number;
  cost: number | null;
  quantity_used: number | null;
  application_date: string;
  notes: string | null;
}

/**
 * Fertility's own edit row — fertilizer_applications has a different shape
 * (zone/application_date/n_lbs_per_1000, no target/rei_hours) than the
 * shared pest_applications tables, so it gets its own small component
 * rather than trying to force one generic shape onto both. Product/category
 * stays fixed, same reasoning as PestApplicationEditRow.
 */
export default function FertilizerApplicationEditRow({
  app,
  products,
  colSpan,
  onCancel,
  onSaved,
}: {
  app: FertilizerApplicationRow;
  products: { id: string; current_stock: number; unit: string }[];
  colSpan: number;
  onCancel: () => void;
  onSaved: (updated: FertilizerApplicationRow) => void;
}) {
  const [zone, setZone] = useState(app.zone);
  const [applicationDate, setApplicationDate] = useState(app.application_date);
  const [nLbsPer1000, setNLbsPer1000] = useState(String(app.n_lbs_per_1000));
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
    const newQuantity = quantityUsed ? parseFloat(quantityUsed) : null;
    const newCost = cost ? parseFloat(cost) : null;

    const { error: updateError } = await supabase
      .from("fertilizer_applications")
      .update({
        zone,
        application_date: applicationDate,
        n_lbs_per_1000: parseFloat(nLbsPer1000),
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
        fertilizerApplicationId: app.id,
        newCost,
        categoryName: "Fertilizer",
        description: `${app.product} — ${zone}`,
        expenseDate: applicationDate,
        source: "application_fertilizer",
      });
    }

    onSaved({
      ...app,
      zone,
      application_date: applicationDate,
      n_lbs_per_1000: parseFloat(nLbsPer1000),
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
          <select
            value={zone}
            onChange={(e) => setZone(e.target.value)}
            className="px-2 py-1.5 border-[1.5px] border-rule rounded text-xs outline-none focus:border-green-mid"
          >
            {COURSE_AREAS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={applicationDate}
            onChange={(e) => setApplicationDate(e.target.value)}
            className="px-2 py-1.5 border-[1.5px] border-rule rounded text-xs outline-none focus:border-green-mid"
          />
          <input
            type="number"
            step="0.001"
            value={nLbsPer1000}
            onChange={(e) => setNLbsPer1000(e.target.value)}
            placeholder="N lbs/M"
            className="w-24 px-2 py-1.5 border-[1.5px] border-rule rounded text-xs outline-none focus:border-green-mid"
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
