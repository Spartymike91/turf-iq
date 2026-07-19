"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { resolveCourseIdClient } from "@/lib/supabase/course-context";
import StatChip from "@/components/ui/StatChip";
import type { ReportData } from "@/lib/monthlyReport";

interface MonthlyReport {
  id: string;
  period_start: string;
  period_end: string;
  generated_at: string;
  generated_by: "auto" | "manual";
  data: ReportData;
  ai_narrative: string | null;
}

function lastMonthRange() {
  const now = new Date();
  const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthEnd = new Date(firstOfThisMonth.getTime() - 86400000);
  const lastMonthStart = new Date(lastMonthEnd.getFullYear(), lastMonthEnd.getMonth(), 1);
  const toStr = (d: Date) => d.toISOString().slice(0, 10);
  return { start: toStr(lastMonthStart), end: toStr(lastMonthEnd) };
}

interface BudgetCategory {
  id: string;
  course_id: string;
  name: string;
  fiscal_year: number;
  annual_budget: number;
}

interface Expense {
  id: string;
  course_id: string;
  category_id: string;
  amount: number;
  description: string | null;
  expense_date: string;
}

function fmtMoney(n: number) {
  const formatted = Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return n < 0 ? `-$${formatted}` : `$${formatted}`;
}

const emptyCategoryForm = { name: "", annual_budget: "" };
const emptyExpenseForm = { category_id: "", amount: "", description: "", expense_date: "" };

export default function BudgetPage() {
  const fiscalYear = new Date().getFullYear();

  const [courseId, setCourseId] = useState<string | null>(null);
  const [courseName, setCourseName] = useState("");
  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [showAddCategory, setShowAddCategory] = useState(false);
  const [addCategoryForm, setAddCategoryForm] = useState(emptyCategoryForm);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editCategoryForm, setEditCategoryForm] = useState(emptyCategoryForm);

  const [showAddExpense, setShowAddExpense] = useState(false);
  const [addExpenseForm, setAddExpenseForm] = useState(emptyExpenseForm);

  const [reports, setReports] = useState<MonthlyReport[]>([]);
  const [reportRange, setReportRange] = useState(lastMonthRange());
  const [generatingReport, setGeneratingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const context = await resolveCourseIdClient(supabase);

      if (!context) {
        setChecking(false);
        return;
      }

      setCourseId(context.courseId);
      const { data: course } = await supabase
        .from("courses")
        .select("name")
        .eq("id", context.courseId)
        .single();
      setCourseName(course?.name ?? "");

      const { data: cats } = await supabase
        .from("budget_categories")
        .select("*")
        .eq("course_id", context.courseId)
        .eq("fiscal_year", fiscalYear)
        .order("name");

      const { data: exp } = await supabase
        .from("expenses")
        .select("*")
        .eq("course_id", context.courseId)
        .gte("expense_date", `${fiscalYear}-01-01`)
        .lte("expense_date", `${fiscalYear}-12-31`)
        .order("expense_date", { ascending: false });

      const { data: reportRows } = await supabase
        .from("monthly_reports")
        .select("*")
        .eq("course_id", context.courseId)
        .order("generated_at", { ascending: false });

      setCategories(cats ?? []);
      setExpenses(exp ?? []);
      setReports(reportRows ?? []);
      setChecking(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const spentByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of expenses) {
      map[e.category_id] = (map[e.category_id] ?? 0) + Number(e.amount);
    }
    return map;
  }, [expenses]);

  const stats = useMemo(() => {
    const annualBudget = categories.reduce((sum, c) => sum + Number(c.annual_budget), 0);
    const ytdSpent = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
    const remaining = annualBudget - ytdSpent;
    const overBudget = categories.filter(
      (c) => (spentByCategory[c.id] ?? 0) > Number(c.annual_budget)
    ).length;
    return { annualBudget, ytdSpent, remaining, overBudget };
  }, [categories, expenses, spentByCategory]);

  async function handleAddCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!courseId || !addCategoryForm.name || !addCategoryForm.annual_budget) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("budget_categories")
      .insert({
        course_id: courseId,
        name: addCategoryForm.name,
        fiscal_year: fiscalYear,
        annual_budget: parseFloat(addCategoryForm.annual_budget),
      })
      .select()
      .single();

    if (insertError) {
      setError(insertError.message);
    } else if (data) {
      setCategories((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setAddCategoryForm(emptyCategoryForm);
      setShowAddCategory(false);
    }
    setSaving(false);
  }

  function startEditCategory(cat: BudgetCategory) {
    setEditingCategoryId(cat.id);
    setEditCategoryForm({ name: cat.name, annual_budget: String(cat.annual_budget) });
  }

  async function handleSaveCategory(id: string) {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { data, error: updateError } = await supabase
      .from("budget_categories")
      .update({
        name: editCategoryForm.name,
        annual_budget: parseFloat(editCategoryForm.annual_budget),
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      setError(updateError.message);
    } else if (data) {
      setCategories((prev) =>
        prev.map((c) => (c.id === id ? data : c)).sort((a, b) => a.name.localeCompare(b.name))
      );
      setEditingCategoryId(null);
    }
    setSaving(false);
  }

  async function handleDeleteCategory(id: string) {
    const supabase = createClient();
    const { error: deleteError } = await supabase.from("budget_categories").delete().eq("id", id);
    if (!deleteError) {
      setCategories((prev) => prev.filter((c) => c.id !== id));
      setExpenses((prev) => prev.filter((e) => e.category_id !== id));
    }
  }

  async function handleAddExpense(e: React.FormEvent) {
    e.preventDefault();
    if (!courseId || !addExpenseForm.category_id || !addExpenseForm.amount) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("expenses")
      .insert({
        course_id: courseId,
        category_id: addExpenseForm.category_id,
        amount: parseFloat(addExpenseForm.amount),
        description: addExpenseForm.description || null,
        expense_date: addExpenseForm.expense_date || new Date().toISOString().slice(0, 10),
      })
      .select()
      .single();

    if (insertError) {
      setError(insertError.message);
    } else if (data) {
      setExpenses((prev) =>
        [...prev, data].sort((a, b) => b.expense_date.localeCompare(a.expense_date))
      );
      setAddExpenseForm(emptyExpenseForm);
      setShowAddExpense(false);
    }
    setSaving(false);
  }

  async function handleDeleteExpense(id: string) {
    const supabase = createClient();
    const { error: deleteError } = await supabase.from("expenses").delete().eq("id", id);
    if (!deleteError) {
      setExpenses((prev) => prev.filter((e) => e.id !== id));
    }
  }

  async function handleGenerateReport() {
    setGeneratingReport(true);
    setReportError(null);
    try {
      const res = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start_date: reportRange.start, end_date: reportRange.end }),
      });
      const data = await res.json();
      if (!res.ok) {
        setReportError(data.error ?? "Could not generate report.");
      } else {
        setReports((prev) => [data.report, ...prev]);
        setExpandedReportId(data.report.id);
      }
    } catch {
      setReportError("Could not generate report.");
    }
    setGeneratingReport(false);
  }

  if (checking) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-mist">Loading...</div>
      </div>
    );
  }

  if (!courseId) {
    return (
      <div className="bg-white border-[1.5px] border-rule rounded-[10px] p-6 text-center">
        <div className="font-serif text-xl text-green-dark mb-2">No course found</div>
        <div className="text-sm text-mist">Set up your course profile before tracking budget.</div>
      </div>
    );
  }

  return (
    <>
      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-green-forest mb-1">
          Budget & Reporting
        </div>
        <div className="font-serif text-2xl text-green-dark">Financial Overview</div>
        <div className="text-[13px] text-mist mt-1">
          {courseName} · FY {fiscalYear}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <StatChip
          label="Annual Budget"
          value={fmtMoney(stats.annualBudget)}
          sub={`Fiscal Year ${fiscalYear}`}
          valueColor="#1a3a2a"
        />
        <StatChip
          label="YTD Spent"
          value={fmtMoney(stats.ytdSpent)}
          sub={
            stats.annualBudget > 0
              ? `${((stats.ytdSpent / stats.annualBudget) * 100).toFixed(0)}% of annual budget`
              : "No budget set"
          }
        />
        <StatChip
          label="Remaining"
          value={fmtMoney(stats.remaining)}
          sub="Annual budget minus YTD spend"
          valueColor={stats.remaining < 0 ? "#dc2626" : "#2d6a4f"}
        />
        <StatChip
          label="Categories Over Budget"
          value={String(stats.overBudget)}
          sub={`of ${categories.length} categories`}
          tag={stats.overBudget > 0 ? "Review needed" : "On track"}
          tagColor={stats.overBudget > 0 ? "warn" : "ok"}
        />
      </div>

      <div className="bg-white border-[1.5px] border-rule rounded-[10px] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b-[1.5px] border-rule">
          <div className="font-serif text-lg text-green-dark">Budget by Category</div>
          <button
            onClick={() => setShowAddCategory((v) => !v)}
            className="px-3.5 py-1.5 bg-green-mid text-white text-xs font-semibold rounded-lg hover:bg-green-dark transition-colors"
          >
            {showAddCategory ? "Cancel" : "+ Add Category"}
          </button>
        </div>

        {showAddCategory && (
          <form
            onSubmit={handleAddCategory}
            className="flex flex-wrap items-end gap-3 px-5 py-4 border-b-[1.5px] border-rule bg-chalk"
          >
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide">Category</label>
              <input
                type="text"
                required
                value={addCategoryForm.name}
                onChange={(e) => setAddCategoryForm({ ...addCategoryForm, name: e.target.value })}
                placeholder="Chemical"
                className="px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid focus:ring-2 focus:ring-green-mid/10"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide">Annual Budget</label>
              <input
                type="number"
                step="0.01"
                required
                value={addCategoryForm.annual_budget}
                onChange={(e) =>
                  setAddCategoryForm({ ...addCategoryForm, annual_budget: e.target.value })
                }
                placeholder="46000"
                className="w-32 px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid focus:ring-2 focus:ring-green-mid/10"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-green-mid text-white text-sm font-semibold rounded-lg hover:bg-green-dark transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </form>
        )}

        {error && <div className="px-5 py-2 text-xs text-red bg-red/5">{error}</div>}

        {categories.length === 0 ? (
          <div className="p-10 text-center">
            <div className="text-4xl mb-3">📊</div>
            <div className="text-sm text-mist">
              No budget categories yet for FY {fiscalYear}. Add your first category above.
            </div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-mono uppercase tracking-wider text-mist border-b border-rule">
                <th className="text-left px-5 py-2.5 font-medium">Category</th>
                <th className="text-left px-3 py-2.5 font-medium">Annual Budget</th>
                <th className="text-left px-3 py-2.5 font-medium">Spent</th>
                <th className="text-left px-3 py-2.5 font-medium">Remaining</th>
                <th className="text-left px-3 py-2.5 font-medium">% Used</th>
                <th className="text-left px-3 py-2.5 font-medium">Status</th>
                <th className="text-right px-5 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => {
                const spent = spentByCategory[cat.id] ?? 0;
                const budget = Number(cat.annual_budget);
                const pctUsed = budget > 0 ? (spent / budget) * 100 : 0;
                const isOver = spent > budget;
                const isNear = !isOver && pctUsed >= 85;

                return (
                  <tr key={cat.id} className="border-b border-rule last:border-0">
                    {editingCategoryId === cat.id ? (
                      <>
                        <td className="px-5 py-2.5">
                          <input
                            value={editCategoryForm.name}
                            onChange={(e) =>
                              setEditCategoryForm({ ...editCategoryForm, name: e.target.value })
                            }
                            className="px-2 py-1 border-[1.5px] border-rule rounded text-sm w-full outline-none focus:border-green-mid"
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <input
                            type="number"
                            step="0.01"
                            value={editCategoryForm.annual_budget}
                            onChange={(e) =>
                              setEditCategoryForm({
                                ...editCategoryForm,
                                annual_budget: e.target.value,
                              })
                            }
                            className="px-2 py-1 border-[1.5px] border-rule rounded text-sm w-28 outline-none focus:border-green-mid"
                          />
                        </td>
                        <td className="px-3 py-2.5 text-mist">{fmtMoney(spent)}</td>
                        <td className="px-3 py-2.5" colSpan={2} />
                        <td className="px-3 py-2.5" />
                        <td className="px-5 py-2.5 text-right whitespace-nowrap">
                          <button
                            onClick={() => handleSaveCategory(cat.id)}
                            disabled={saving}
                            className="text-green-mid text-xs font-semibold hover:text-green-dark mr-3"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingCategoryId(null)}
                            className="text-mist text-xs font-semibold hover:text-ink"
                          >
                            Cancel
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-5 py-2.5 font-medium">{cat.name}</td>
                        <td className="px-3 py-2.5 font-mono">{fmtMoney(budget)}</td>
                        <td className="px-3 py-2.5 font-mono">{fmtMoney(spent)}</td>
                        <td
                          className="px-3 py-2.5 font-mono"
                          style={{ color: budget - spent < 0 ? "#dc2626" : undefined }}
                        >
                          {fmtMoney(budget - spent)}
                        </td>
                        <td className="px-3 py-2.5 font-mono">{pctUsed.toFixed(0)}%</td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded font-mono ${
                              isOver
                                ? "bg-red/10 text-red"
                                : isNear
                                ? "bg-amber/10 text-[#92400e]"
                                : "bg-green-pale text-green-mid"
                            }`}
                          >
                            {isOver ? "OVER BUDGET" : isNear ? "NEAR LIMIT" : "ON TRACK"}
                          </span>
                        </td>
                        <td className="px-5 py-2.5 text-right whitespace-nowrap">
                          <button
                            onClick={() => startEditCategory(cat)}
                            className="text-mist text-xs font-semibold hover:text-green-dark mr-3"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteCategory(cat.id)}
                            className="text-mist text-xs font-semibold hover:text-red"
                          >
                            Delete
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="bg-white border-[1.5px] border-rule rounded-[10px] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b-[1.5px] border-rule">
          <div className="font-serif text-lg text-green-dark">Expense Log</div>
          <button
            onClick={() => setShowAddExpense((v) => !v)}
            disabled={categories.length === 0}
            className="px-3.5 py-1.5 bg-green-mid text-white text-xs font-semibold rounded-lg hover:bg-green-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {showAddExpense ? "Cancel" : "+ Log Expense"}
          </button>
        </div>

        {categories.length === 0 ? (
          <div className="p-10 text-center">
            <div className="text-sm text-mist">Add a budget category before logging expenses.</div>
          </div>
        ) : (
          <>
            {showAddExpense && (
              <form
                onSubmit={handleAddExpense}
                className="flex flex-wrap items-end gap-3 px-5 py-4 border-b-[1.5px] border-rule bg-chalk"
              >
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold uppercase tracking-wide">Category</label>
                  <select
                    required
                    value={addExpenseForm.category_id}
                    onChange={(e) =>
                      setAddExpenseForm({ ...addExpenseForm, category_id: e.target.value })
                    }
                    className="px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid"
                  >
                    <option value="">Select...</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold uppercase tracking-wide">Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={addExpenseForm.amount}
                    onChange={(e) => setAddExpenseForm({ ...addExpenseForm, amount: e.target.value })}
                    placeholder="1250.00"
                    className="w-28 px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid focus:ring-2 focus:ring-green-mid/10"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold uppercase tracking-wide">Date</label>
                  <input
                    type="date"
                    value={addExpenseForm.expense_date}
                    onChange={(e) =>
                      setAddExpenseForm({ ...addExpenseForm, expense_date: e.target.value })
                    }
                    className="px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid"
                  />
                </div>
                <div className="flex flex-col gap-1.5 flex-1 min-w-[160px]">
                  <label className="text-[11px] font-semibold uppercase tracking-wide">
                    Description
                  </label>
                  <input
                    type="text"
                    value={addExpenseForm.description}
                    onChange={(e) =>
                      setAddExpenseForm({ ...addExpenseForm, description: e.target.value })
                    }
                    placeholder="Velista fungicide application"
                    className="px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid focus:ring-2 focus:ring-green-mid/10"
                  />
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-green-mid text-white text-sm font-semibold rounded-lg hover:bg-green-dark transition-colors disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </form>
            )}

            {expenses.length === 0 ? (
              <div className="p-10 text-center">
                <div className="text-sm text-mist">No expenses logged yet for FY {fiscalYear}.</div>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] font-mono uppercase tracking-wider text-mist border-b border-rule">
                    <th className="text-left px-5 py-2.5 font-medium">Date</th>
                    <th className="text-left px-3 py-2.5 font-medium">Category</th>
                    <th className="text-left px-3 py-2.5 font-medium">Description</th>
                    <th className="text-left px-3 py-2.5 font-medium">Amount</th>
                    <th className="text-right px-5 py-2.5 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((exp) => (
                    <tr key={exp.id} className="border-b border-rule last:border-0">
                      <td className="px-5 py-2.5 text-mist">{exp.expense_date}</td>
                      <td className="px-3 py-2.5">
                        {categories.find((c) => c.id === exp.category_id)?.name ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-mist">{exp.description || "—"}</td>
                      <td className="px-3 py-2.5 font-mono">{fmtMoney(Number(exp.amount))}</td>
                      <td className="px-5 py-2.5 text-right">
                        <button
                          onClick={() => handleDeleteExpense(exp.id)}
                          className="text-mist text-xs font-semibold hover:text-red"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>

      <style>{`
        @media print {
          header, .no-print { display: none !important; }
        }
      `}</style>

      <div className="bg-white border-[1.5px] border-rule rounded-[10px] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b-[1.5px] border-rule no-print">
          <div>
            <div className="font-serif text-lg text-green-dark">Monthly Reports</div>
            <div className="text-[11px] text-mist mt-0.5">
              Auto-generates on the 1st of every month · or generate one now for any date range
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3 px-5 py-4 border-b-[1.5px] border-rule bg-chalk no-print">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wide">From</label>
            <input
              type="date"
              value={reportRange.start}
              onChange={(e) => setReportRange({ ...reportRange, start: e.target.value })}
              className="px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wide">To</label>
            <input
              type="date"
              value={reportRange.end}
              onChange={(e) => setReportRange({ ...reportRange, end: e.target.value })}
              className="px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid"
            />
          </div>
          <button
            onClick={handleGenerateReport}
            disabled={generatingReport}
            className="px-4 py-2 bg-green-mid text-white text-sm font-semibold rounded-lg hover:bg-green-dark transition-colors disabled:opacity-50"
          >
            {generatingReport ? "Generating..." : "Generate Report"}
          </button>
        </div>

        {reportError && <div className="px-5 py-2 text-xs text-red bg-red/5 no-print">{reportError}</div>}

        {reports.length === 0 ? (
          <div className="p-10 text-center">
            <div className="text-4xl mb-3">📄</div>
            <div className="text-sm text-mist">No reports generated yet. Generate your first one above.</div>
          </div>
        ) : (
          <div>
            {reports.map((r) => {
              const expanded = expandedReportId === r.id;
              return (
                <div key={r.id} className="border-b border-rule last:border-0">
                  <button
                    onClick={() => setExpandedReportId(expanded ? null : r.id)}
                    className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-chalk no-print"
                  >
                    <span className="text-sm font-medium">
                      {r.period_start} to {r.period_end}
                    </span>
                    <span className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-mono uppercase tracking-wide px-1.5 py-0.5 rounded ${
                          r.generated_by === "auto" ? "bg-blue/10 text-blue" : "bg-green-pale text-green-mid"
                        }`}
                      >
                        {r.generated_by}
                      </span>
                      <span className="text-xs text-mist">{expanded ? "Hide ↑" : "View →"}</span>
                    </span>
                  </button>

                  {expanded && (
                    <div className="px-5 pb-5">
                      <div className="flex items-center justify-between mb-3">
                        <div className="font-serif text-base text-green-dark">
                          Recap: {r.period_start} to {r.period_end}
                        </div>
                        <button
                          onClick={() => window.print()}
                          className="no-print px-3 py-1.5 border-[1.5px] border-rule rounded-lg text-xs font-semibold hover:border-green-mid transition-colors"
                        >
                          🖨 Print
                        </button>
                      </div>

                      <div className="grid grid-cols-3 gap-3 mb-4">
                        <StatChip
                          label="Budget vs. Actual"
                          value={fmtMoney(r.data.expenses.totalSpent)}
                          sub={`Pro-rated budget: ${fmtMoney(r.data.expenses.totalBudgetProRated)}`}
                          valueColor={r.data.expenses.totalSpent > r.data.expenses.totalBudgetProRated ? "#dc2626" : "#2d6a4f"}
                        />
                        <StatChip
                          label="Dollar Spot"
                          value={r.data.disease.noHistoricalData ? "No data" : `${r.data.disease.daysAboveDollarSpotThreshold}d`}
                          sub={
                            r.data.disease.noHistoricalData
                              ? "Historical logging hadn't started yet for this period"
                              : `days above threshold of ${r.data.disease.daysLogged} logged`
                          }
                          tagColor={r.data.disease.daysAboveDollarSpotThreshold > 0 ? "warn" : "ok"}
                        />
                        <StatChip
                          label="Equipment"
                          value={String(r.data.equipment.completedMaintenance.length)}
                          sub={`services completed · ${r.data.equipment.currentIssues.length} currently need attention`}
                          tagColor={r.data.equipment.currentIssues.length > 0 ? "amber" : "ok"}
                        />
                      </div>

                      {r.ai_narrative && (
                        <div className="bg-chalk border-[1.5px] border-rule rounded-lg p-4 mb-4">
                          <div className="text-[10px] font-mono uppercase tracking-wider text-mist mb-2">
                            AI Agronomist Recap
                          </div>
                          <div className="text-sm text-ink leading-relaxed">{r.ai_narrative}</div>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-4 text-xs">
                        <div>
                          <div className="text-[10px] font-mono uppercase tracking-wider text-mist mb-1.5">
                            By Category
                          </div>
                          {r.data.expenses.byCategory.length === 0 ? (
                            <div className="text-mist">No categories set</div>
                          ) : (
                            r.data.expenses.byCategory.map((c) => (
                              <div key={c.name} className="flex justify-between py-1 border-b border-rule">
                                <span>{c.name}</span>
                                <span className="font-mono">
                                  {fmtMoney(c.spent)} / {fmtMoney(c.budgetProRated)}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                        <div>
                          <div className="text-[10px] font-mono uppercase tracking-wider text-mist mb-1.5">
                            Applications Logged
                          </div>
                          {r.data.pestApplications.length === 0 && r.data.fertilizerApplications.length === 0 ? (
                            <div className="text-mist">None logged this period</div>
                          ) : (
                            <>
                              {r.data.pestApplications.map((a, i) => (
                                <div key={`p${i}`} className="py-1 border-b border-rule">
                                  {a.target} ({a.product}) — {new Date(a.applied_at).toLocaleDateString()}
                                </div>
                              ))}
                              {r.data.fertilizerApplications.map((a, i) => (
                                <div key={`f${i}`} className="py-1 border-b border-rule">
                                  {a.product} — {new Date(a.application_date).toLocaleDateString()}
                                </div>
                              ))}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
