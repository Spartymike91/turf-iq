import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveCourseIdServer } from "@/lib/supabase/course-context.server";

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

// Records a budget expense for a logged product application (Fertility,
// Weed, Insects, Disease Risk). Routed server-side with the service-role
// client, same pattern as /api/tasks/complete's labor/materials cost
// logging — budget_categories/expenses' SELECT policy is gated behind the
// sensitive-data PIN, and Postgres requires INSERT ... RETURNING to also
// satisfy the SELECT policy for the row it just wrote, so a direct
// client-side insert+select here fails for any owner/superintendent who
// hasn't separately unlocked the PIN on the Budget page.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const context = await resolveCourseIdServer(supabase, user);
  if (!context) {
    return NextResponse.json({ error: "No course found for this user." }, { status: 404 });
  }
  const courseId = context.courseId;

  const { categoryName, amount, description, expenseDate, source, fertilizerApplicationId, pestApplicationId } =
    (await request.json()) as {
      categoryName?: string;
      amount?: number;
      description?: string;
      expenseDate?: string;
      source?: string;
      fertilizerApplicationId?: string;
      pestApplicationId?: string;
    };
  if (!categoryName || !amount || !description || !expenseDate || !source) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  const adminClient = createAdminClient();

  if (!context.isAdminView) {
    const { data: membership } = await supabase
      .from("course_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("course_id", courseId)
      .single();
    if (!membership || (membership.role !== "owner" && membership.role !== "superintendent")) {
      return NextResponse.json({ error: "You don't have permission to record expenses." }, { status: 403 });
    }
  }

  const fiscalYear = new Date(expenseDate).getFullYear();
  const categoryId = await findOrCreateCategory(adminClient, courseId, categoryName, fiscalYear);

  const { error: insertError } = await adminClient.from("expenses").insert({
    course_id: courseId,
    category_id: categoryId,
    amount,
    description,
    expense_date: expenseDate,
    source,
    fertilizer_application_id: fertilizerApplicationId ?? null,
    pest_application_id: pestApplicationId ?? null,
  });
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// Removes the expense(s) linked to a logged application, so it can be
// re-recorded with an updated amount when a superintendent edits the
// application (see reconcileExpenseForEdit in src/lib/applicationEdits.ts).
// Routed server-side for the same reason as the POST handler above: Postgres
// requires a row to also satisfy the table's SELECT policy for DELETE to
// affect it, not just the DELETE policy — so a direct client-side delete
// silently affects 0 rows for any owner/superintendent who hasn't separately
// unlocked the sensitive-data PIN on the Budget page.
export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const context = await resolveCourseIdServer(supabase, user);
  if (!context) {
    return NextResponse.json({ error: "No course found for this user." }, { status: 404 });
  }
  const courseId = context.courseId;

  const { fertilizerApplicationId, pestApplicationId } = (await request.json()) as {
    fertilizerApplicationId?: string;
    pestApplicationId?: string;
  };
  if (!fertilizerApplicationId && !pestApplicationId) {
    return NextResponse.json({ error: "Missing fertilizerApplicationId or pestApplicationId." }, { status: 400 });
  }

  if (!context.isAdminView) {
    const { data: membership } = await supabase
      .from("course_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("course_id", courseId)
      .single();
    if (!membership || (membership.role !== "owner" && membership.role !== "superintendent")) {
      return NextResponse.json({ error: "You don't have permission to delete expenses." }, { status: 403 });
    }
  }

  const adminClient = createAdminClient();
  let query = adminClient.from("expenses").delete().eq("course_id", courseId);
  query = fertilizerApplicationId
    ? query.eq("fertilizer_application_id", fertilizerApplicationId)
    : query.eq("pest_application_id", pestApplicationId as string);

  const { error: deleteError } = await query;
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
