import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveCourseIdServer } from "@/lib/supabase/course-context.server";
import { canManageAssignment } from "@/lib/taskPermissions";

const LABOR_CATEGORY = "Labor";
const MATERIALS_CATEGORY = "Materials & Supplies";

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

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const context = await resolveCourseIdServer(supabase);
  if (!context) {
    return NextResponse.json({ error: "No course found for this user." }, { status: 404 });
  }
  const courseId = context.courseId;

  const { assignment_id, materials_cost, materials_note, quality_rating } = (await request.json()) as {
    assignment_id?: string;
    materials_cost?: number;
    materials_note?: string;
    quality_rating?: number;
  };
  if (!assignment_id) {
    return NextResponse.json({ error: "assignment_id is required." }, { status: 400 });
  }
  if (quality_rating != null && (quality_rating < 1 || quality_rating > 5)) {
    return NextResponse.json({ error: "quality_rating must be between 1 and 5." }, { status: 400 });
  }

  const adminClient = createAdminClient();

  const { data: assignment, error: fetchError } = await adminClient
    .from("task_assignments")
    .select("*")
    .eq("id", assignment_id)
    .eq("course_id", courseId)
    .single();
  if (fetchError || !assignment) {
    return NextResponse.json({ error: "Task assignment not found." }, { status: 404 });
  }

  const allowed = await canManageAssignment(
    supabase,
    adminClient,
    user.id,
    courseId,
    context.isAdminView,
    assignment.assigned_to
  );
  if (!allowed) {
    return NextResponse.json({ error: "You can only complete tasks assigned to you." }, { status: 403 });
  }

  const completedAt = new Date();
  const { data: updated, error: updateError } = await adminClient
    .from("task_assignments")
    .update({
      status: "complete",
      completed_at: completedAt.toISOString(),
      ...(quality_rating != null ? { quality_rating } : {}),
    })
    .eq("id", assignment_id)
    .select()
    .single();
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const fiscalYear = completedAt.getFullYear();
  const todayStr = completedAt.toISOString().slice(0, 10);

  let laborExpense = null;
  let materialsExpense = null;

  // Labor cost: only computable if the task was actually started (we need a
  // real elapsed duration) and is assigned to an employee with a pay rate on
  // file. Silently skipped otherwise rather than guessing.
  if (assignment.started_at && assignment.assigned_to) {
    const { data: existingLabor } = await adminClient
      .from("expenses")
      .select("id")
      .eq("task_assignment_id", assignment_id)
      .eq("source", "task_labor")
      .maybeSingle();

    if (!existingLabor) {
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

      if (employee && rateRow) {
        const actualMinutes = Math.max(
          0,
          (completedAt.getTime() - new Date(assignment.started_at).getTime()) / 60000
        );
        const laborCost = Math.round((actualMinutes / 60) * Number(rateRow.hourly_rate) * 100) / 100;

        if (laborCost > 0) {
          const categoryId = await findOrCreateCategory(adminClient, courseId, LABOR_CATEGORY, fiscalYear);
          const { data: inserted, error: insertError } = await adminClient
            .from("expenses")
            .insert({
              course_id: courseId,
              category_id: categoryId,
              amount: laborCost,
              description: `${employee.name} — ${assignment.name} (${Math.round(actualMinutes)} min)`,
              expense_date: todayStr,
              task_assignment_id: assignment_id,
              source: "task_labor",
            })
            .select()
            .single();
          if (!insertError) laborExpense = inserted;
        }
      }
    }
  }

  if (materials_cost && materials_cost > 0) {
    const { data: existingMaterials } = await adminClient
      .from("expenses")
      .select("id")
      .eq("task_assignment_id", assignment_id)
      .eq("source", "task_materials")
      .maybeSingle();

    if (!existingMaterials) {
      const categoryId = await findOrCreateCategory(adminClient, courseId, MATERIALS_CATEGORY, fiscalYear);
      const { data: inserted, error: insertError } = await adminClient
        .from("expenses")
        .insert({
          course_id: courseId,
          category_id: categoryId,
          amount: materials_cost,
          description: materials_note || `${assignment.name} materials`,
          expense_date: todayStr,
          task_assignment_id: assignment_id,
          source: "task_materials",
        })
        .select()
        .single();
      if (!insertError) materialsExpense = inserted;
    }
  }

  return NextResponse.json({ assignment: updated, laborExpense, materialsExpense });
}
