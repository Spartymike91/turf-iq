import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveCourseIdServer } from "@/lib/supabase/course-context.server";
import { findOrCreateBudgetCategoryId } from "@/lib/budgetCategories";
import { IMPORT_MAX_ROWS, validateImportRow, matchProductByName, type RawImportRow } from "@/lib/applicationImport";
import { CATEGORY_TO_BUDGET_NAME, type ProductCategory } from "@/lib/pestCategorization";

// Chunk size for bulk inserts — comfortably under Supabase/Vercel payload
// and timeout limits even for a multi-thousand-row import, while keeping
// the number of round-trips small.
const CHUNK_SIZE = 500;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function requireOwnerOrSuper(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  courseId: string,
  isAdminView: boolean
): Promise<boolean> {
  if (isAdminView) return true;
  const { data: membership } = await supabase
    .from("course_members")
    .select("role")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .single();
  return !!membership && (membership.role === "owner" || membership.role === "superintendent");
}

type PreparedRow = {
  index: number;
  id: string;
  table: "fertilizer_applications" | "pest_applications";
  category: ProductCategory;
  cost: number | null;
  date: string;
  product: string;
  area: string;
  insertPayload: Record<string, unknown>;
};

// Imports a CSV of historical applications in bulk — see LogApplicationForm's
// handleSubmit for the single-entry equivalent this mirrors. Two deliberate
// differences: no stock decrement (current_stock reflects present-day
// inventory, not what was on hand years ago), and every row is tagged with
// import_batch_id so the whole batch can be undone in one action via DELETE
// below — a bad first CSV attempt is easy to make and painful to unwind row
// by row otherwise.
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

  if (!(await requireOwnerOrSuper(supabase, user.id, courseId, context.isAdminView))) {
    return NextResponse.json({ error: "You don't have permission to import applications." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { rows?: RawImportRow[] } | null;
  const rows = body?.rows;
  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: "No rows provided." }, { status: 400 });
  }
  if (rows.length > IMPORT_MAX_ROWS) {
    return NextResponse.json({ error: `Too many rows — max ${IMPORT_MAX_ROWS} per import.` }, { status: 400 });
  }

  // Never trust client-side validation alone — re-run the exact same rules
  // server-side from the shared module.
  const validated = rows.map((r, i) => validateImportRow(r, i));
  const rejected = validated.filter((v) => !v.ok).map((v) => ({ index: v.index, errors: v.errors }));
  const validRows = validated.filter((v) => v.ok && v.normalized);

  if (validRows.length === 0) {
    return NextResponse.json({
      importBatchId: null,
      totalRows: rows.length,
      rejected,
      insertFailed: [],
      imported: 0,
      expensesCreated: 0,
      expenseFailed: [],
      byCategory: {},
    });
  }

  const adminClient = createAdminClient();

  const { data: activeProducts } = await adminClient
    .from("products")
    .select("id, name, category")
    .eq("course_id", courseId)
    .eq("is_active", true);
  const productsList = activeProducts ?? [];

  const importBatchId = crypto.randomUUID();

  // Every row gets an explicitly-generated id here (rather than relying on
  // the DB default), so the expense-insert pass below can reference the
  // right application row without depending on insert-response ordering.
  const prepared: PreparedRow[] = validRows.map((v) => {
    const n = v.normalized!;
    const productId = matchProductByName(productsList, n.productName, n.category)?.id ?? null;
    const id = crypto.randomUUID();

    if (n.category === "fertilizer") {
      return {
        index: v.index,
        id,
        table: "fertilizer_applications",
        category: n.category,
        cost: n.cost,
        date: n.date,
        product: n.productName,
        area: n.area,
        insertPayload: {
          id,
          course_id: courseId,
          zone: n.area,
          product: n.productName,
          product_id: productId,
          n_lbs_per_1000: n.rateNPer1000 ?? 0,
          cost: n.cost,
          quantity_used: n.quantityUsed,
          application_date: n.date,
          notes: n.notes,
          import_batch_id: importBatchId,
        },
      };
    }

    return {
      index: v.index,
      id,
      table: "pest_applications",
      category: n.category,
      cost: n.cost,
      date: n.date,
      product: n.productName,
      area: n.area,
      insertPayload: {
        id,
        course_id: courseId,
        applied_at: `${n.date}T12:00:00.000Z`,
        area: n.area,
        target: n.target,
        category: n.category,
        product: n.productName,
        product_id: productId,
        rei_hours: n.reiHours ?? 0,
        cost: n.cost,
        quantity_used: n.quantityUsed,
        notes: n.notes,
        import_batch_id: importBatchId,
      },
    };
  });

  const fertilizerRows = prepared.filter((p) => p.table === "fertilizer_applications");
  const otherRows = prepared.filter((p) => p.table === "pest_applications");

  const insertFailed: { index: number; error: string }[] = [];
  const insertedRows: PreparedRow[] = [];

  // Chunks within a table run sequentially (an unambiguous failure boundary
  // per chunk); the two tables' chunk sequences run in parallel with each
  // other since they're independent. A failed chunk doesn't abort the rest
  // of the import — its rows are recorded as insertFailed and the remaining
  // chunks still proceed.
  async function insertChunks(table: "fertilizer_applications" | "pest_applications", items: PreparedRow[]) {
    for (const c of chunk(items, CHUNK_SIZE)) {
      const { error } = await adminClient.from(table).insert(c.map((p) => p.insertPayload));
      if (error) {
        for (const p of c) insertFailed.push({ index: p.index, error: error.message });
      } else {
        insertedRows.push(...c);
      }
    }
  }

  await Promise.all([
    insertChunks("fertilizer_applications", fertilizerRows),
    insertChunks("pest_applications", otherRows),
  ]);

  // Budget expense fan-out — mirrors recordApplicationExpense, but batched:
  // each unique (budget category, fiscal year) pair is resolved once, not
  // once per row, and each row's own historical date drives its fiscal
  // year (never "today"), so a multi-year import correctly spans several
  // budget_categories rows.
  const costedRows = insertedRows.filter((r) => r.cost !== null && r.cost > 0);
  const categoryIdCache = new Map<string, string>();
  const expenseFailed: { index: number; error: string }[] = [];
  const expensePayloads: { row: PreparedRow; payload: Record<string, unknown> }[] = [];

  for (const row of costedRows) {
    const fiscalYear = new Date(row.date).getFullYear();
    const categoryName = CATEGORY_TO_BUDGET_NAME[row.category];
    const cacheKey = `${categoryName}::${fiscalYear}`;
    let categoryId = categoryIdCache.get(cacheKey);
    if (!categoryId) {
      try {
        categoryId = await findOrCreateBudgetCategoryId(adminClient, courseId, categoryName, fiscalYear);
        categoryIdCache.set(cacheKey, categoryId);
      } catch (err) {
        expenseFailed.push({
          index: row.index,
          error: err instanceof Error ? err.message : "Failed to resolve budget category.",
        });
        continue;
      }
    }
    expensePayloads.push({
      row,
      payload: {
        course_id: courseId,
        category_id: categoryId,
        amount: row.cost,
        description: `${row.product} — ${row.area}`,
        expense_date: row.date,
        source: row.table === "fertilizer_applications" ? "application_fertilizer" : "application_pest",
        fertilizer_application_id: row.table === "fertilizer_applications" ? row.id : null,
        pest_application_id: row.table === "pest_applications" ? row.id : null,
      },
    });
  }

  let expensesCreated = 0;
  for (const c of chunk(expensePayloads, CHUNK_SIZE)) {
    const { error } = await adminClient.from("expenses").insert(c.map((e) => e.payload));
    if (error) {
      for (const e of c) expenseFailed.push({ index: e.row.index, error: error.message });
    } else {
      expensesCreated += c.length;
    }
  }

  const byCategory: Partial<Record<ProductCategory, number>> = {};
  for (const row of insertedRows) {
    byCategory[row.category] = (byCategory[row.category] ?? 0) + 1;
  }

  return NextResponse.json({
    importBatchId,
    totalRows: rows.length,
    rejected,
    insertFailed,
    imported: insertedRows.length,
    expensesCreated,
    expenseFailed,
    byCategory,
  });
}

// Undoes an entire import batch in one action. Deleting the application
// rows cascades into their linked expenses automatically via the existing
// expenses.fertilizer_application_id/pest_application_id ON DELETE CASCADE
// foreign keys — no separate expense-cleanup step needed.
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

  if (!(await requireOwnerOrSuper(supabase, user.id, courseId, context.isAdminView))) {
    return NextResponse.json({ error: "You don't have permission to delete an import." }, { status: 403 });
  }

  const { importBatchId } = (await request.json().catch(() => ({}))) as { importBatchId?: string };
  if (!importBatchId) {
    return NextResponse.json({ error: "importBatchId is required." }, { status: 400 });
  }

  const adminClient = createAdminClient();

  const { data: deletedFertilizer, error: fertError } = await adminClient
    .from("fertilizer_applications")
    .delete()
    .eq("course_id", courseId)
    .eq("import_batch_id", importBatchId)
    .select("id");
  if (fertError) return NextResponse.json({ error: fertError.message }, { status: 500 });

  const { data: deletedPest, error: pestError } = await adminClient
    .from("pest_applications")
    .delete()
    .eq("course_id", courseId)
    .eq("import_batch_id", importBatchId)
    .select("id");
  if (pestError) return NextResponse.json({ error: pestError.message }, { status: 500 });

  return NextResponse.json({
    success: true,
    deletedFertilizer: deletedFertilizer?.length ?? 0,
    deletedPest: deletedPest?.length ?? 0,
  });
}

// Lists recent import batches for this course (most recent first), grouped
// in-memory from the two application tables — no dedicated import-batches
// table; this app's per-course row counts don't warrant one yet.
export async function GET() {
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

  const adminClient = createAdminClient();

  const [{ data: fertRows }, { data: pestRows }] = await Promise.all([
    adminClient
      .from("fertilizer_applications")
      .select("import_batch_id, cost, created_at")
      .eq("course_id", courseId)
      .not("import_batch_id", "is", null),
    adminClient
      .from("pest_applications")
      .select("import_batch_id, cost, created_at")
      .eq("course_id", courseId)
      .not("import_batch_id", "is", null),
  ]);

  const batches = new Map<string, { count: number; totalCost: number; importedAt: string }>();
  for (const row of [...(fertRows ?? []), ...(pestRows ?? [])]) {
    const batchId = row.import_batch_id as string;
    const createdAt = row.created_at as string;
    const existing = batches.get(batchId) ?? { count: 0, totalCost: 0, importedAt: createdAt };
    existing.count += 1;
    existing.totalCost += Number(row.cost ?? 0);
    if (createdAt > existing.importedAt) existing.importedAt = createdAt;
    batches.set(batchId, existing);
  }

  const recentImports = Array.from(batches.entries())
    .map(([importBatchId, v]) => ({ importBatchId, ...v }))
    .sort((a, b) => (a.importedAt < b.importedAt ? 1 : -1))
    .slice(0, 20);

  return NextResponse.json({ recentImports });
}
