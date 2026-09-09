import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Finds the budget_categories row for (course, name, fiscal year), creating
 * it with a $0 annual_budget if it doesn't exist yet. Shared by every
 * server route that posts an expense on a course's behalf (currently
 * record-expense and the bulk application importer) so the lookup/create
 * logic can't drift between them.
 */
export async function findOrCreateBudgetCategoryId(
  adminClient: ReturnType<typeof createAdminClient>,
  courseId: string,
  name: string,
  fiscalYear: number
): Promise<string> {
  const { data: existing } = await adminClient
    .from("budget_categories")
    .select("id")
    .eq("course_id", courseId)
    .eq("name", name)
    .eq("fiscal_year", fiscalYear)
    .maybeSingle();
  if (existing) return existing.id as string;

  const { data: created, error } = await adminClient
    .from("budget_categories")
    .insert({ course_id: courseId, name, fiscal_year: fiscalYear, annual_budget: 0 })
    .select("id")
    .single();
  if (error) throw error;
  return created.id as string;
}
