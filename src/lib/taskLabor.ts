import { createAdminClient } from "@/lib/supabase/admin";

const LABOR_CATEGORY = "Labor";

async function findOrCreateCategory(
  adminClient: ReturnType<typeof createAdminClient>,
  courseId: string,
  name: string,
  fiscalYear: number
) {
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

// Shared by /api/tasks/complete (first computation, on the way to
// "complete") and /api/tasks/edit-time (recomputation, after the fact) —
// extracted so the two never drift into two different cost formulas.
// Creates the expense if none exists yet, updates it in place if one
// does (keyed on task_assignment_id + source: 'task_labor'), and deletes
// it if the corrected time no longer produces a real cost — a stale
// nonzero expense left behind after an edit would be exactly the "wrong
// number in the numbers overall" problem this whole feature exists to fix.
export async function upsertTaskLaborExpense(
  adminClient: ReturnType<typeof createAdminClient>,
  courseId: string,
  assignment: { id: string; name: string; assigned_to: string | null },
  actualMinutes: number,
  expenseDateForNewRow: string // YYYY-MM-DD, only used if no expense exists yet
) {
  const { data: existing } = await adminClient
    .from("expenses")
    .select("id")
    .eq("task_assignment_id", assignment.id)
    .eq("source", "task_labor")
    .maybeSingle();

  if (!assignment.assigned_to) {
    if (existing) await adminClient.from("expenses").delete().eq("id", existing.id);
    return null;
  }

  const { data: employee } = await adminClient
    .from("employees")
    .select("name")
    .eq("id", assignment.assigned_to)
    .maybeSingle();
  const { data: rateRow } = await adminClient
    .from("employee_pay_rates")
    .select("hourly_rate")
    .eq("employee_id", assignment.assigned_to)
    .maybeSingle();

  if (!employee || !rateRow) return null; // can't price it — leave any existing row untouched rather than guess

  const laborCost = Math.round((actualMinutes / 60) * Number(rateRow.hourly_rate) * 100) / 100;

  if (laborCost <= 0) {
    if (existing) await adminClient.from("expenses").delete().eq("id", existing.id);
    return null;
  }

  const description = `${employee.name} — ${assignment.name} (${Math.round(actualMinutes)} min)`;

  if (existing) {
    const { data: updated, error } = await adminClient
      .from("expenses")
      .update({ amount: laborCost, description })
      .eq("id", existing.id)
      .select()
      .single();
    if (error) return null;
    return updated;
  }

  const fiscalYear = new Date(expenseDateForNewRow).getFullYear();
  const categoryId = await findOrCreateCategory(adminClient, courseId, LABOR_CATEGORY, fiscalYear);
  const { data: inserted, error } = await adminClient
    .from("expenses")
    .insert({
      course_id: courseId,
      category_id: categoryId,
      amount: laborCost,
      description,
      expense_date: expenseDateForNewRow,
      task_assignment_id: assignment.id,
      source: "task_labor",
    })
    .select()
    .single();
  if (error) return null;
  return inserted;
}
