/**
 * Records a budget expense for a logged product application. "Fertilizer"
 * for fertilizer_applications; pest_applications route to "Fungicides",
 * "Herbicides", "Insecticides", "Growth Regulators", or "Other" based on
 * each line's own resolved category (see LogApplicationForm.tsx).
 *
 * Goes through /api/applications/record-expense (service-role client)
 * rather than a direct client-side insert — budget_categories/expenses'
 * SELECT policy is gated behind the sensitive-data PIN, and Postgres
 * requires INSERT ... RETURNING to also satisfy the SELECT policy for the
 * row it just wrote, so a direct insert+select from the browser client
 * fails for any owner/superintendent who hasn't separately unlocked the
 * PIN on the Budget page.
 *
 * Best-effort: throws on failure, but callers treat this the same as the
 * stock-decrement follow-up — a budget-recording hiccup shouldn't undo the
 * application log entry, which already saved successfully.
 */
export async function recordApplicationExpense(params: {
  categoryName: "Fertilizer" | "Fungicides" | "Herbicides" | "Insecticides" | "Growth Regulators" | "Other";
  amount: number;
  description: string;
  expenseDate: string; // YYYY-MM-DD
  source: "application_fertilizer" | "application_pest";
  fertilizerApplicationId?: string;
  pestApplicationId?: string;
}): Promise<void> {
  const res = await fetch("/api/applications/record-expense", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to record application expense.");
  }
}

/**
 * Deletes the expense(s) linked to a logged application. Goes through the
 * same /api/applications/record-expense route (service-role client) as
 * recordApplicationExpense, for the same reason: Postgres requires a row to
 * also satisfy the SELECT policy for DELETE to affect it, not just the
 * DELETE policy, so a direct client-side delete silently affects 0 rows for
 * any owner/superintendent who hasn't unlocked the sensitive-data PIN.
 */
export async function deleteApplicationExpense(params: {
  fertilizerApplicationId?: string;
  pestApplicationId?: string;
}): Promise<void> {
  const res = await fetch("/api/applications/record-expense", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to delete application expense.");
  }
}
