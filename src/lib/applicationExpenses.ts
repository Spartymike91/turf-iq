import type { SupabaseClient } from "@supabase/supabase-js";

async function findOrCreateCategory(
  supabase: SupabaseClient,
  courseId: string,
  name: string,
  fiscalYear: number
): Promise<string> {
  const { data: existing } = await supabase
    .from("budget_categories")
    .select("id")
    .eq("course_id", courseId)
    .eq("name", name)
    .eq("fiscal_year", fiscalYear)
    .maybeSingle();
  if (existing) return existing.id as string;

  const { data: created, error } = await supabase
    .from("budget_categories")
    .insert({ course_id: courseId, name, fiscal_year: fiscalYear, annual_budget: 0 })
    .select("id")
    .single();
  if (error) throw error;
  return created.id as string;
}

/**
 * Records a budget expense for a logged product application. "Fertilizer"
 * for fertilizer_applications; pest_applications route to "Fungicides"
 * (Disease Risk) or "Herbicides & Insecticides" (Weed, Insects) — mirrors
 * the auto-created "Labor"/"Materials & Supplies" categories from task
 * completion.
 *
 * Best-effort: throws on failure, but callers treat this the same as the
 * stock-decrement follow-up — a budget-recording hiccup shouldn't undo the
 * application log entry, which already saved successfully.
 */
export async function recordApplicationExpense(
  supabase: SupabaseClient,
  params: {
    courseId: string;
    categoryName: "Fertilizer" | "Fungicides" | "Herbicides & Insecticides";
    amount: number;
    description: string;
    expenseDate: string; // YYYY-MM-DD
    source: "application_fertilizer" | "application_pest";
    fertilizerApplicationId?: string;
    pestApplicationId?: string;
  }
): Promise<void> {
  const fiscalYear = new Date(params.expenseDate).getFullYear();
  const categoryId = await findOrCreateCategory(supabase, params.courseId, params.categoryName, fiscalYear);
  await supabase.from("expenses").insert({
    course_id: params.courseId,
    category_id: categoryId,
    amount: params.amount,
    description: params.description,
    expense_date: params.expenseDate,
    source: params.source,
    fertilizer_application_id: params.fertilizerApplicationId ?? null,
    pest_application_id: params.pestApplicationId ?? null,
  });
}
