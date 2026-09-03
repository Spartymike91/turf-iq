import type { SupabaseClient } from "@supabase/supabase-js";
import { recordApplicationExpense, deleteApplicationExpense } from "@/lib/applicationExpenses";

/**
 * Reconciles product stock when a logged application line is edited —
 * reverses the old quantity's deduction (if any) and applies the new one,
 * handling the linked product itself changing too. Best-effort, mirroring
 * the existing add-flow's stock decrement (a stock-sync hiccup shouldn't
 * block saving the edit itself).
 */
export async function reconcileStockForEdit(
  supabase: SupabaseClient,
  params: {
    oldProductId: string | null;
    oldQuantityUsed: number | null;
    newProductId: string | null;
    newQuantityUsed: number | null;
    products: { id: string; current_stock: number }[];
  }
): Promise<void> {
  const { oldProductId, oldQuantityUsed, newProductId, newQuantityUsed, products } = params;

  if (oldProductId === newProductId) {
    if (!newProductId) return;
    const delta = (oldQuantityUsed ?? 0) - (newQuantityUsed ?? 0);
    if (delta === 0) return;
    const product = products.find((p) => p.id === newProductId);
    if (!product) return;
    await supabase
      .from("products")
      .update({ current_stock: Number(product.current_stock) + delta })
      .eq("id", newProductId);
    return;
  }

  // Linked product itself changed — restore the old product's stock, then
  // deduct from the new one.
  if (oldProductId && oldQuantityUsed) {
    const oldProduct = products.find((p) => p.id === oldProductId);
    if (oldProduct) {
      await supabase
        .from("products")
        .update({ current_stock: Number(oldProduct.current_stock) + oldQuantityUsed })
        .eq("id", oldProductId);
    }
  }
  if (newProductId && newQuantityUsed) {
    const newProduct = products.find((p) => p.id === newProductId);
    if (newProduct) {
      await supabase
        .from("products")
        .update({ current_stock: Number(newProduct.current_stock) - newQuantityUsed })
        .eq("id", newProductId);
    }
  }
}

/**
 * Reconciles the linked budget expense when an edited line's cost changes.
 * Deletes any existing expense tied to this application and creates a fresh
 * one if the new cost is set. Both steps go through
 * /api/applications/record-expense (service-role client) — Postgres
 * requires a row to also satisfy a table's SELECT policy for UPDATE/DELETE
 * to affect it, not just the UPDATE/DELETE policy itself, and
 * expenses' SELECT policy is gated behind the sensitive-data PIN, so a
 * direct client-side delete silently affects 0 rows for any
 * owner/superintendent who hasn't unlocked it. Delete-then-recreate is
 * simpler than an in-place update and reuses the existing
 * recordApplicationExpense insert path rather than adding an update one.
 */
export async function reconcileExpenseForEdit(params: {
  pestApplicationId?: string;
  fertilizerApplicationId?: string;
  newCost: number | null;
  categoryName: "Fertilizer" | "Fungicides" | "Herbicides" | "Insecticides" | "Growth Regulators" | "Other";
  description: string;
  expenseDate: string;
  source: "application_fertilizer" | "application_pest";
}): Promise<void> {
  const { pestApplicationId, fertilizerApplicationId, newCost, categoryName, description, expenseDate, source } = params;

  await deleteApplicationExpense({ pestApplicationId, fertilizerApplicationId });

  if (newCost != null && newCost > 0) {
    await recordApplicationExpense({
      categoryName,
      amount: newCost,
      description,
      expenseDate,
      source,
      pestApplicationId,
      fertilizerApplicationId,
    });
  }
}
