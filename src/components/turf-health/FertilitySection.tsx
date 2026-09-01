"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { resolveCourseIdClient } from "@/lib/supabase/course-context";
import StatChip from "@/components/ui/StatChip";
import AlertBanner from "@/components/ui/AlertBanner";
import { COURSE_AREAS } from "@/lib/areas";
import { recordApplicationExpense } from "@/lib/applicationExpenses";
import { printSection } from "@/lib/printSection";

interface FertilizerApplication {
  id: string;
  course_id: string;
  zone: string;
  product: string;
  product_id: string | null;
  n_lbs_per_1000: number;
  cost: number | null;
  quantity_used: number | null;
  application_date: string;
  notes: string | null;
}

interface Product {
  id: string;
  name: string;
  category: string;
  unit: string;
  unit_cost: number | null;
  current_stock: number;
}

interface SoilTest {
  id: string;
  course_id: string;
  zone: string;
  test_date: string;
  ph: number | null;
  phosphorus_ppm: number | null;
  potassium_ppm: number | null;
  iron_ppm: number | null;
  notes: string | null;
}

// Standard reference ranges used to flag deficiencies from the latest soil test
const RANGES = {
  ph: { min: 6.0, max: 7.0, label: "pH" },
  phosphorus_ppm: { min: 25, max: 50, label: "Phosphorus (P)" },
  potassium_ppm: { min: 100, max: 200, label: "Potassium (K)" },
  iron_ppm: { min: 80, max: 120, label: "Iron (Fe)" },
} as const;

const emptyAppForm = {
  zone: "",
  application_date: "",
  notes: "",
};

const emptyAppLine = {
  productId: "",
  customName: "",
  n_lbs_per_1000: "",
  cost: "",
  quantity_used: "",
};

const emptyTestForm = {
  zone: "",
  test_date: "",
  ph: "",
  phosphorus_ppm: "",
  potassium_ppm: "",
  iron_ppm: "",
  notes: "",
};

function daysAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export default function FertilitySection() {
  const fiscalYear = new Date().getFullYear();

  const [courseId, setCourseId] = useState<string | null>(null);
  const [courseName, setCourseName] = useState("");
  const [grassType, setGrassType] = useState("");
  const [annualTarget, setAnnualTarget] = useState<number>(0);
  const [targetInput, setTargetInput] = useState("");
  const [editingTarget, setEditingTarget] = useState(false);
  const [applications, setApplications] = useState<FertilizerApplication[]>([]);
  const [soilTests, setSoilTests] = useState<SoilTest[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [showAddApp, setShowAddApp] = useState(false);
  const [addAppForm, setAddAppForm] = useState(emptyAppForm);
  const [appLines, setAppLines] = useState([{ ...emptyAppLine }]);
  const [showAddTest, setShowAddTest] = useState(false);
  const [addTestForm, setAddTestForm] = useState(emptyTestForm);

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
        .select("name, grass_type")
        .eq("id", context.courseId)
        .single();
      setCourseName(course?.name ?? "");
      setGrassType(course?.grass_type ?? "");

      const { data: program } = await supabase
        .from("fertility_programs")
        .select("*")
        .eq("course_id", context.courseId)
        .eq("fiscal_year", fiscalYear)
        .maybeSingle();

      if (program) {
        setAnnualTarget(Number(program.annual_n_target));
        setTargetInput(String(program.annual_n_target));
      }

      const { data: apps } = await supabase
        .from("fertilizer_applications")
        .select("*")
        .eq("course_id", context.courseId)
        .gte("application_date", `${fiscalYear}-01-01`)
        .lte("application_date", `${fiscalYear}-12-31`)
        .order("application_date", { ascending: false });

      const { data: tests } = await supabase
        .from("soil_tests")
        .select("*")
        .eq("course_id", context.courseId)
        .order("test_date", { ascending: false });

      const { data: prods } = await supabase
        .from("products")
        .select("id, name, category, unit, unit_cost, current_stock")
        .eq("course_id", context.courseId)
        .eq("is_active", true)
        .in("category", ["fertilizer", "other"])
        .order("name");

      setApplications(apps ?? []);
      setSoilTests(tests ?? []);
      setProducts(prods ?? []);
      setChecking(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => {
    const nAppliedYtd = applications.reduce((sum, a) => sum + Number(a.n_lbs_per_1000), 0);
    const spendYtd = applications.reduce((sum, a) => sum + Number(a.cost ?? 0), 0);
    const lastApp = applications[0] ?? null;
    const lastTest = soilTests[0] ?? null;
    return { nAppliedYtd, spendYtd, lastApp, lastTest };
  }, [applications, soilTests]);

  const deficiency = useMemo(() => {
    const test = soilTests[0];
    if (!test) return null;
    const issues: string[] = [];
    for (const key of Object.keys(RANGES) as (keyof typeof RANGES)[]) {
      const value = test[key];
      if (value === null || value === undefined) continue;
      const range = RANGES[key];
      if (Number(value) < range.min) {
        issues.push(`${range.label} low: ${value} (target ${range.min}–${range.max})`);
      } else if (Number(value) > range.max) {
        issues.push(`${range.label} high: ${value} (target ${range.min}–${range.max})`);
      }
    }
    if (issues.length === 0) return null;
    return { zone: test.zone, date: test.test_date, issues };
  }, [soilTests]);

  async function handleSaveTarget() {
    if (!courseId || !targetInput) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { data, error: upsertError } = await supabase
      .from("fertility_programs")
      .upsert(
        {
          course_id: courseId,
          fiscal_year: fiscalYear,
          annual_n_target: parseFloat(targetInput),
        },
        { onConflict: "course_id,fiscal_year" }
      )
      .select()
      .single();

    if (upsertError) {
      setError(upsertError.message);
    } else if (data) {
      setAnnualTarget(Number(data.annual_n_target));
      setEditingTarget(false);
    }
    setSaving(false);
  }

  function updateAppLine(index: number, patch: Partial<typeof emptyAppLine>) {
    setAppLines((prev) =>
      prev.map((l, i) => {
        if (i !== index) return l;
        const next = { ...l, ...patch };
        // Auto-compute cost from the directory product's unit cost whenever
        // the product or quantity changes — still editable afterward, but a
        // later edit to either will recompute and overwrite a manual value.
        if ("productId" in patch || "quantity_used" in patch) {
          const product = products.find((p) => p.id === next.productId);
          const qty = parseFloat(next.quantity_used);
          if (product?.unit_cost != null && !Number.isNaN(qty)) {
            next.cost = (Number(product.unit_cost) * qty).toFixed(2);
          }
        }
        return next;
      })
    );
  }

  function addAppLine() {
    setAppLines((prev) => [...prev, { ...emptyAppLine }]);
  }

  function removeAppLine(index: number) {
    setAppLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  async function handleAddApplication(e: React.FormEvent) {
    e.preventDefault();
    const validLines = appLines.filter((l) => (l.productId || l.customName) && l.n_lbs_per_1000);
    if (!courseId || !addAppForm.zone || validLines.length === 0) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const dateStr = addAppForm.application_date || new Date().toISOString().slice(0, 10);

    const rows = validLines.map((l) => {
      const product = products.find((p) => p.id === l.productId);
      return {
        course_id: courseId,
        zone: addAppForm.zone,
        product: product ? product.name : l.customName,
        product_id: product ? product.id : null,
        n_lbs_per_1000: parseFloat(l.n_lbs_per_1000),
        cost: l.cost ? parseFloat(l.cost) : null,
        quantity_used: product && l.quantity_used ? parseFloat(l.quantity_used) : null,
        application_date: dateStr,
        notes: addAppForm.notes || null,
      };
    });

    const { data, error: insertError } = await supabase.from("fertilizer_applications").insert(rows).select();

    if (insertError) {
      setError(insertError.message);
    } else if (data) {
      setApplications((prev) =>
        [...prev, ...data].sort((a, b) => b.application_date.localeCompare(a.application_date))
      );

      // Best-effort stock decrement for directory-linked lines with a used quantity.
      for (const line of validLines) {
        const product = products.find((p) => p.id === line.productId);
        if (product && line.quantity_used) {
          const newStock = Number(product.current_stock) - parseFloat(line.quantity_used);
          const { error: stockError } = await supabase
            .from("products")
            .update({ current_stock: newStock })
            .eq("id", product.id);
          if (!stockError) {
            setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, current_stock: newStock } : p)));
          }
        }
      }

      // Best-effort: record a matching budget expense for any line with a cost.
      for (const row of data) {
        if (row.cost) {
          try {
            await recordApplicationExpense(supabase, {
              courseId,
              categoryName: "Fertilizer",
              amount: Number(row.cost),
              description: `${row.product} — ${row.zone}`,
              expenseDate: row.application_date,
              source: "application_fertilizer",
              fertilizerApplicationId: row.id,
            });
          } catch (expenseError) {
            console.error("Failed to record fertilizer application expense:", expenseError);
          }
        }
      }

      setAddAppForm(emptyAppForm);
      setAppLines([{ ...emptyAppLine }]);
      setShowAddApp(false);
    }
    setSaving(false);
  }

  async function handleDeleteApplication(id: string) {
    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from("fertilizer_applications")
      .delete()
      .eq("id", id);
    if (!deleteError) {
      setApplications((prev) => prev.filter((a) => a.id !== id));
    }
  }

  async function handleAddTest(e: React.FormEvent) {
    e.preventDefault();
    if (!courseId || !addTestForm.zone) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("soil_tests")
      .insert({
        course_id: courseId,
        zone: addTestForm.zone,
        test_date: addTestForm.test_date || new Date().toISOString().slice(0, 10),
        ph: addTestForm.ph ? parseFloat(addTestForm.ph) : null,
        phosphorus_ppm: addTestForm.phosphorus_ppm ? parseFloat(addTestForm.phosphorus_ppm) : null,
        potassium_ppm: addTestForm.potassium_ppm ? parseFloat(addTestForm.potassium_ppm) : null,
        iron_ppm: addTestForm.iron_ppm ? parseFloat(addTestForm.iron_ppm) : null,
        notes: addTestForm.notes || null,
      })
      .select()
      .single();

    if (insertError) {
      setError(insertError.message);
    } else if (data) {
      setSoilTests((prev) => [...prev, data].sort((a, b) => b.test_date.localeCompare(a.test_date)));
      setAddTestForm(emptyTestForm);
      setShowAddTest(false);
    }
    setSaving(false);
  }

  async function handleDeleteTest(id: string) {
    const supabase = createClient();
    const { error: deleteError } = await supabase.from("soil_tests").delete().eq("id", id);
    if (!deleteError) {
      setSoilTests((prev) => prev.filter((t) => t.id !== id));
    }
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
        <div className="text-sm text-mist">Set up your course profile before tracking fertility.</div>
      </div>
    );
  }

  const pctOfTarget = annualTarget > 0 ? (stats.nAppliedYtd / annualTarget) * 100 : 0;

  return (
    <>
      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-green-forest mb-1">
          Fertility Program
        </div>
        <div className="font-serif text-2xl text-green-dark">Annual Nutrient Management</div>
        <div className="text-[13px] text-mist mt-1">
          {courseName} {grassType && `· ${grassType}`} · {fiscalYear} Program Year
        </div>
      </div>

      {deficiency && (
        <AlertBanner
          variant="amber"
          icon="⚠️"
          title={`Nutrient issue — ${deficiency.zone} · Soil test: ${deficiency.date}`}
          body={deficiency.issues.join(" · ")}
        />
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatChip
          label="N Applied YTD"
          value={stats.nAppliedYtd.toFixed(3)}
          unit="lbs/M"
          sub={annualTarget > 0 ? `Target: ${annualTarget.toFixed(1)} lbs/M season` : "No target set"}
          tag={annualTarget > 0 ? `${pctOfTarget.toFixed(0)}% of annual` : undefined}
          tagColor={pctOfTarget > 100 ? "warn" : "ok"}
          valueColor="#2d6a4f"
        />
        <StatChip
          label="Last Application"
          value={stats.lastApp ? stats.lastApp.application_date : "—"}
          sub={stats.lastApp ? `${stats.lastApp.zone} · ${stats.lastApp.product}` : "No applications logged"}
          tag={stats.lastApp ? `${daysAgo(stats.lastApp.application_date)}d ago` : undefined}
          tagColor="blue"
        />
        <StatChip
          label="Fertility Spend YTD"
          value={`$${stats.spendYtd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          sub={`${applications.length} application${applications.length === 1 ? "" : "s"} logged`}
        />
        <StatChip
          label="Soil Tests"
          value={String(soilTests.length)}
          unit="on file"
          sub={stats.lastTest ? `Last test: ${stats.lastTest.test_date}` : "No tests yet"}
          tag={stats.lastTest && daysAgo(stats.lastTest.test_date) > 90 ? "Due for retest" : undefined}
          tagColor="amber"
        />
      </div>

      <div className="bg-white border-[1.5px] border-rule rounded-[10px] px-5 py-4 flex items-center justify-between flex-wrap gap-3">
        <div className="text-sm">
          <span className="font-semibold text-green-dark">Annual N Target ({fiscalYear}):</span>{" "}
          {editingTarget ? (
            <span className="inline-flex items-center gap-2 ml-1">
              <input
                type="number"
                step="0.1"
                value={targetInput}
                onChange={(e) => setTargetInput(e.target.value)}
                className="w-20 px-2 py-1 border-[1.5px] border-rule rounded text-sm outline-none focus:border-green-mid"
              />
              <span className="text-mist text-xs">lbs/M</span>
              <button
                onClick={handleSaveTarget}
                disabled={saving}
                className="text-green-mid text-xs font-semibold hover:text-green-dark"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setEditingTarget(false);
                  setTargetInput(String(annualTarget));
                }}
                className="text-mist text-xs font-semibold hover:text-ink"
              >
                Cancel
              </button>
            </span>
          ) : (
            <span className="ml-1 text-mist">
              {annualTarget > 0 ? `${annualTarget.toFixed(1)} lbs/M season` : "Not set"}{" "}
              <button
                onClick={() => setEditingTarget(true)}
                className="text-green-mid font-semibold hover:text-green-dark ml-1"
              >
                Edit
              </button>
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red/5 border-[1.5px] border-red/40 rounded-lg px-4 py-2 text-xs text-red">
          {error}
        </div>
      )}

      <div id="fertility-application-log" className="bg-white border-[1.5px] border-rule rounded-[10px] overflow-hidden shrink-0">
        <div className="flex items-center justify-between px-5 py-4 border-b-[1.5px] border-rule">
          <div className="font-serif text-lg text-green-dark">Application Log</div>
          <div className="flex items-center gap-2 no-print">
            <button
              onClick={() => printSection("fertility-application-log")}
              className="px-3.5 py-1.5 border-[1.5px] border-rule text-ink text-xs font-semibold rounded-lg hover:border-green-mid transition-colors"
            >
              Print
            </button>
            <button
              onClick={() => setShowAddApp((v) => !v)}
              className="px-3.5 py-1.5 bg-green-mid text-white text-xs font-semibold rounded-lg hover:bg-green-dark transition-colors"
            >
              {showAddApp ? "Cancel" : "+ Log Application"}
            </button>
          </div>
        </div>

        {showAddApp && (
          <form
            onSubmit={handleAddApplication}
            className="flex flex-col gap-3 px-5 py-4 border-b-[1.5px] border-rule bg-chalk no-print"
          >
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wide">Area</label>
                <select
                  required
                  value={addAppForm.zone}
                  onChange={(e) => setAddAppForm({ ...addAppForm, zone: e.target.value })}
                  className="w-36 px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid"
                >
                  <option value="" disabled>
                    Select area
                  </option>
                  {COURSE_AREAS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wide">Date</label>
                <input
                  type="date"
                  value={addAppForm.application_date}
                  onChange={(e) => setAddAppForm({ ...addAppForm, application_date: e.target.value })}
                  className="px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid"
                />
              </div>
              <div className="flex flex-col gap-1.5 flex-1 min-w-[140px]">
                <label className="text-[11px] font-semibold uppercase tracking-wide">Notes</label>
                <input
                  type="text"
                  value={addAppForm.notes}
                  onChange={(e) => setAddAppForm({ ...addAppForm, notes: e.target.value })}
                  placeholder="Spoon-feed, low mow height"
                  className="px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid focus:ring-2 focus:ring-green-mid/10"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-semibold uppercase tracking-wide">
                Products <span className="text-mist font-normal normal-case">— log a tank mix in one pass</span>
              </label>
              {appLines.map((line, i) => {
                const linkedProduct = products.find((p) => p.id === line.productId);
                return (
                  <div key={i} className="flex flex-wrap items-end gap-2">
                    <select
                      value={line.productId}
                      onChange={(e) => updateAppLine(i, { productId: e.target.value })}
                      className="w-40 px-2 py-1.5 border-[1.5px] border-rule rounded text-xs outline-none focus:border-green-mid"
                    >
                      <option value="">— Custom / not in directory —</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    {!line.productId && (
                      <input
                        required
                        value={line.customName}
                        onChange={(e) => updateAppLine(i, { customName: e.target.value })}
                        placeholder="Urea 46-0-0"
                        className="w-36 px-2 py-1.5 border-[1.5px] border-rule rounded text-xs outline-none focus:border-green-mid"
                      />
                    )}
                    <input
                      type="number"
                      step="0.001"
                      required
                      value={line.n_lbs_per_1000}
                      onChange={(e) => updateAppLine(i, { n_lbs_per_1000: e.target.value })}
                      placeholder="N lbs/M"
                      className="w-24 px-2 py-1.5 border-[1.5px] border-rule rounded text-xs outline-none focus:border-green-mid"
                    />
                    <input
                      type="number"
                      step="0.01"
                      value={line.cost}
                      onChange={(e) => updateAppLine(i, { cost: e.target.value })}
                      placeholder="Cost"
                      className="w-20 px-2 py-1.5 border-[1.5px] border-rule rounded text-xs outline-none focus:border-green-mid"
                    />
                    {linkedProduct && (
                      <input
                        type="number"
                        step="0.01"
                        value={line.quantity_used}
                        onChange={(e) => updateAppLine(i, { quantity_used: e.target.value })}
                        placeholder={`Qty used (${linkedProduct.unit})`}
                        title={`Deducted from stock (currently ${linkedProduct.current_stock} ${linkedProduct.unit})`}
                        className="w-32 px-2 py-1.5 border-[1.5px] border-rule rounded text-xs outline-none focus:border-green-mid"
                      />
                    )}
                    {appLines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeAppLine(i)}
                        className="text-mist text-xs font-semibold hover:text-red"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                );
              })}
              <button
                type="button"
                onClick={addAppLine}
                className="self-start text-xs font-semibold text-green-mid hover:text-green-dark"
              >
                + Add Product
              </button>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="self-start px-4 py-2 bg-green-mid text-white text-sm font-semibold rounded-lg hover:bg-green-dark transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </form>
        )}

        {applications.length === 0 ? (
          <div className="p-10 text-center">
            <div className="text-4xl mb-3">🌱</div>
            <div className="text-sm text-mist">
              No applications logged yet for {fiscalYear}. Add your first one above.
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="text-[10px] font-mono uppercase tracking-wider text-mist border-b border-rule">
                <th className="text-left px-5 py-2.5 font-medium">Date</th>
                <th className="text-left px-3 py-2.5 font-medium">Zone</th>
                <th className="text-left px-3 py-2.5 font-medium">Product</th>
                <th className="text-left px-3 py-2.5 font-medium">N (lbs/M)</th>
                <th className="text-left px-3 py-2.5 font-medium">Cost</th>
                <th className="text-left px-3 py-2.5 font-medium">Notes</th>
                <th className="text-right px-5 py-2.5 font-medium no-print">Actions</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((app) => (
                <tr key={app.id} className="border-b border-rule last:border-0">
                  <td className="px-5 py-2.5 text-mist">{app.application_date}</td>
                  <td className="px-3 py-2.5 font-medium">{app.zone}</td>
                  <td className="px-3 py-2.5">{app.product}</td>
                  <td className="px-3 py-2.5 font-mono">{Number(app.n_lbs_per_1000).toFixed(3)}</td>
                  <td className="px-3 py-2.5 font-mono">
                    {app.cost != null ? `$${Number(app.cost).toFixed(2)}` : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-mist">{app.notes || "—"}</td>
                  <td className="px-5 py-2.5 text-right no-print">
                    <button
                      onClick={() => handleDeleteApplication(app.id)}
                      className="text-mist text-xs font-semibold hover:text-red"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <div className="bg-white border-[1.5px] border-rule rounded-[10px] overflow-hidden shrink-0">
        <div className="flex items-center justify-between px-5 py-4 border-b-[1.5px] border-rule">
          <div className="font-serif text-lg text-green-dark">Soil Tests</div>
          <button
            onClick={() => setShowAddTest((v) => !v)}
            className="px-3.5 py-1.5 bg-green-mid text-white text-xs font-semibold rounded-lg hover:bg-green-dark transition-colors"
          >
            {showAddTest ? "Cancel" : "+ Log Soil Test"}
          </button>
        </div>

        {showAddTest && (
          <form
            onSubmit={handleAddTest}
            className="flex flex-wrap items-end gap-3 px-5 py-4 border-b-[1.5px] border-rule bg-chalk"
          >
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide">Zone</label>
              <input
                type="text"
                required
                value={addTestForm.zone}
                onChange={(e) => setAddTestForm({ ...addTestForm, zone: e.target.value })}
                placeholder="Greens"
                className="w-28 px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid focus:ring-2 focus:ring-green-mid/10"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide">Date</label>
              <input
                type="date"
                value={addTestForm.test_date}
                onChange={(e) => setAddTestForm({ ...addTestForm, test_date: e.target.value })}
                className="px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide">pH</label>
              <input
                type="number"
                step="0.1"
                value={addTestForm.ph}
                onChange={(e) => setAddTestForm({ ...addTestForm, ph: e.target.value })}
                placeholder="6.5"
                className="w-16 px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid focus:ring-2 focus:ring-green-mid/10"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide">P (ppm)</label>
              <input
                type="number"
                step="0.1"
                value={addTestForm.phosphorus_ppm}
                onChange={(e) => setAddTestForm({ ...addTestForm, phosphorus_ppm: e.target.value })}
                placeholder="35"
                className="w-20 px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid focus:ring-2 focus:ring-green-mid/10"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide">K (ppm)</label>
              <input
                type="number"
                step="0.1"
                value={addTestForm.potassium_ppm}
                onChange={(e) => setAddTestForm({ ...addTestForm, potassium_ppm: e.target.value })}
                placeholder="150"
                className="w-20 px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid focus:ring-2 focus:ring-green-mid/10"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide">Fe (ppm)</label>
              <input
                type="number"
                step="0.1"
                value={addTestForm.iron_ppm}
                onChange={(e) => setAddTestForm({ ...addTestForm, iron_ppm: e.target.value })}
                placeholder="42"
                className="w-20 px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid focus:ring-2 focus:ring-green-mid/10"
              />
            </div>
            <div className="flex flex-col gap-1.5 flex-1 min-w-[140px]">
              <label className="text-[11px] font-semibold uppercase tracking-wide">Notes</label>
              <input
                type="text"
                value={addTestForm.notes}
                onChange={(e) => setAddTestForm({ ...addTestForm, notes: e.target.value })}
                placeholder="Sent to A&L Labs"
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

        {soilTests.length === 0 ? (
          <div className="p-10 text-center">
            <div className="text-sm text-mist">No soil tests on file yet. Add your first one above.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="text-[10px] font-mono uppercase tracking-wider text-mist border-b border-rule">
                <th className="text-left px-5 py-2.5 font-medium">Date</th>
                <th className="text-left px-3 py-2.5 font-medium">Zone</th>
                <th className="text-left px-3 py-2.5 font-medium">pH</th>
                <th className="text-left px-3 py-2.5 font-medium">P (ppm)</th>
                <th className="text-left px-3 py-2.5 font-medium">K (ppm)</th>
                <th className="text-left px-3 py-2.5 font-medium">Fe (ppm)</th>
                <th className="text-left px-3 py-2.5 font-medium">Notes</th>
                <th className="text-right px-5 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {soilTests.map((test) => (
                <tr key={test.id} className="border-b border-rule last:border-0">
                  <td className="px-5 py-2.5 text-mist">{test.test_date}</td>
                  <td className="px-3 py-2.5 font-medium">{test.zone}</td>
                  <td className="px-3 py-2.5 font-mono">{test.ph ?? "—"}</td>
                  <td className="px-3 py-2.5 font-mono">{test.phosphorus_ppm ?? "—"}</td>
                  <td className="px-3 py-2.5 font-mono">{test.potassium_ppm ?? "—"}</td>
                  <td className="px-3 py-2.5 font-mono">{test.iron_ppm ?? "—"}</td>
                  <td className="px-3 py-2.5 text-mist">{test.notes || "—"}</td>
                  <td className="px-5 py-2.5 text-right">
                    <button
                      onClick={() => handleDeleteTest(test.id)}
                      className="text-mist text-xs font-semibold hover:text-red"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </>
  );
}
