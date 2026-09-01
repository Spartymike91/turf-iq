"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { resolveCourseIdClient } from "@/lib/supabase/course-context";
import type { WeatherResult } from "@/lib/weather";
import { getWhiteGrubStatus, getAbwStatus, isCoolSeasonGrass } from "@/lib/pestModels";
import { COURSE_AREAS } from "@/lib/areas";
import { recordApplicationExpense } from "@/lib/applicationExpenses";
import { isWeedApplication, isDiseaseTarget } from "@/lib/pestCategorization";
import { printSection } from "@/lib/printSection";

interface PestApplication {
  id: string;
  course_id: string;
  applied_at: string;
  target: string;
  area: string | null;
  product: string;
  product_id: string | null;
  rei_hours: number;
  cost: number | null;
  quantity_used: number | null;
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

const emptyForm = { target: "", area: "", applied_at: "", notes: "" };
const emptyLine = { productId: "", customName: "", rei_hours: "", cost: "", quantity_used: "" };

function toLocalDatetimeInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function InsectsSection() {
  const [courseId, setCourseId] = useState<string | null>(null);
  const [courseName, setCourseName] = useState("");
  const [grassType, setGrassType] = useState("");
  const [weather, setWeather] = useState<WeatherResult | null>(null);
  const [applications, setApplications] = useState<PestApplication[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState(emptyForm);
  const [lines, setLines] = useState([{ ...emptyLine }]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

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

      const { data: apps } = await supabase
        .from("pest_applications")
        .select("*")
        .eq("course_id", context.courseId)
        .order("applied_at", { ascending: false });
      setApplications(apps ?? []);

      const { data: prods } = await supabase
        .from("products")
        .select("id, name, category, unit, unit_cost, current_stock")
        .eq("course_id", context.courseId)
        .eq("is_active", true)
        .in("category", ["insecticide", "other"])
        .order("name");
      setProducts(prods ?? []);

      try {
        const res = await fetch("/api/weather");
        const data = await res.json();
        if (res.ok) setWeather(data);
      } catch {
        // insect page still works without weather (spray log is independent)
      }

      setChecking(false);
    }
    load();
  }, []);

  // Insects is the catch-all remainder of pest_applications — anything not
  // claimed by Weed's keyword/category match or Disease's keyword match.
  const insectApplications = applications.filter(
    (a) => !isWeedApplication(a, products) && !isDiseaseTarget(a.target)
  );

  function updateLine(index: number, patch: Partial<typeof emptyLine>) {
    setLines((prev) =>
      prev.map((l, i) => {
        if (i !== index) return l;
        const next = { ...l, ...patch };
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

  function addLine() {
    setLines((prev) => [...prev, { ...emptyLine }]);
  }

  function removeLine(index: number) {
    setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const validLines = lines.filter((l) => l.productId || l.customName);
    if (!courseId || !addForm.target || !addForm.area || validLines.length === 0) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const appliedAt = addForm.applied_at ? new Date(addForm.applied_at).toISOString() : new Date().toISOString();

    const rows = validLines.map((l) => {
      const product = products.find((p) => p.id === l.productId);
      return {
        course_id: courseId,
        applied_at: appliedAt,
        target: addForm.target,
        area: addForm.area,
        product: product ? product.name : l.customName,
        product_id: product ? product.id : null,
        rei_hours: l.rei_hours ? parseInt(l.rei_hours) : 0,
        cost: l.cost ? parseFloat(l.cost) : null,
        quantity_used: product && l.quantity_used ? parseFloat(l.quantity_used) : null,
        notes: addForm.notes || null,
      };
    });

    const { data, error: insertError } = await supabase.from("pest_applications").insert(rows).select();

    if (insertError) {
      setError(insertError.message);
    } else if (data) {
      setApplications((prev) => [...prev, ...data].sort((a, b) => b.applied_at.localeCompare(a.applied_at)));

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

      for (const row of data) {
        if (row.cost) {
          try {
            await recordApplicationExpense(supabase, {
              courseId,
              categoryName: "Chemicals",
              amount: Number(row.cost),
              description: `${row.product} — ${row.target}${row.area ? ` (${row.area})` : ""}`,
              expenseDate: row.applied_at.slice(0, 10),
              source: "application_pest",
              pestApplicationId: row.id,
            });
          } catch (expenseError) {
            console.error("Failed to record insect application expense:", expenseError);
          }
        }
      }

      setAddForm(emptyForm);
      setLines([{ ...emptyLine }]);
      setShowAdd(false);
      setNow(Date.now());
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    const supabase = createClient();
    const { error: deleteError } = await supabase.from("pest_applications").delete().eq("id", id);
    if (!deleteError) setApplications((prev) => prev.filter((a) => a.id !== id));
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
        <div className="text-sm text-mist">Set up your course profile before tracking insect timing.</div>
      </div>
    );
  }

  const gdd = weather?.agronomics.gddSeasonToDate ?? null;
  const whiteGrub = gdd != null ? getWhiteGrubStatus(gdd) : null;
  const showAbw = isCoolSeasonGrass(grassType);
  const abw = showAbw && gdd != null ? getAbwStatus(gdd) : null;

  const cards = [
    whiteGrub && { name: "White Grub", badge: "GUIDANCE RANGE", badgeColor: "bg-amber", status: whiteGrub },
    abw && { name: "Annual Bluegrass Weevil", badge: "MODEL", badgeColor: "bg-green-mid", status: abw },
  ].filter((c): c is { name: string; badge: string; badgeColor: string; status: NonNullable<typeof whiteGrub> } => Boolean(c));

  return (
    <>
      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-green-forest mb-1">Insect Control</div>
        <div className="font-serif text-2xl text-green-dark">Insect Management</div>
        <div className="text-[13px] text-mist mt-1">
          {gdd != null ? `${gdd.toFixed(0)} GDD (Base 50°F)` : "GDD unavailable"} · {grassType || "—"} · {courseName}
        </div>
      </div>

      {!weather && (
        <div className="bg-white border-[1.5px] border-rule rounded-[10px] p-6 text-center">
          <div className="text-sm text-mist">GDD-based insect timing needs live weather data, which is unavailable right now.</div>
        </div>
      )}

      {cards.length > 0 && (
        <div className={`grid gap-3`} style={{ gridTemplateColumns: `repeat(${cards.length}, minmax(0, 1fr))` }}>
          {cards.map((c) => (
            <div
              key={c.name}
              className={`bg-white border-[1.5px] rounded-lg p-3.5 ${c.status.elevated ? "border-amber" : "border-rule"}`}
            >
              <div className="flex items-center justify-between gap-1.5 mb-1.5">
                <span className="text-[11px] font-semibold text-ink">{c.name}</span>
                <span className={`text-[8px] font-bold px-1 py-0.5 rounded text-white font-mono ${c.badgeColor}`}>
                  {c.badge}
                </span>
              </div>
              <div className={`text-sm font-semibold mb-1 ${c.status.elevated ? "text-amber" : "text-green-mid"}`}>
                {c.status.stage}
              </div>
              <div className="text-[11px] text-mist leading-relaxed">{c.status.detail}</div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="bg-red/5 border-[1.5px] border-red/40 rounded-lg px-4 py-2 text-xs text-red">{error}</div>
      )}

      <div id="insect-application-log" className="bg-white border-[1.5px] border-rule rounded-[10px] overflow-hidden shrink-0">
        <div className="flex items-center justify-between px-5 py-4 border-b-[1.5px] border-rule">
          <div className="font-serif text-lg text-green-dark">Application Log — REI Compliance</div>
          <div className="flex items-center gap-2 no-print">
            <button
              onClick={() => printSection("insect-application-log")}
              className="px-3.5 py-1.5 border-[1.5px] border-rule text-ink text-xs font-semibold rounded-lg hover:border-green-mid transition-colors"
            >
              Print
            </button>
            <button
              onClick={() => setShowAdd((v) => !v)}
              className="px-3.5 py-1.5 bg-green-mid text-white text-xs font-semibold rounded-lg hover:bg-green-dark transition-colors"
            >
              {showAdd ? "Cancel" : "+ Log Application"}
            </button>
          </div>
        </div>

        {showAdd && (
          <form onSubmit={handleAdd} className="flex flex-col gap-3 px-5 py-4 border-b-[1.5px] border-rule bg-chalk no-print">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wide">Target</label>
                <input
                  type="text"
                  required
                  value={addForm.target}
                  onChange={(e) => setAddForm({ ...addForm, target: e.target.value })}
                  placeholder="White Grub"
                  className="w-32 px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid focus:ring-2 focus:ring-green-mid/10"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wide">Area</label>
                <select
                  required
                  value={addForm.area}
                  onChange={(e) => setAddForm({ ...addForm, area: e.target.value })}
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
                <label className="text-[11px] font-semibold uppercase tracking-wide">Applied At</label>
                <input
                  type="datetime-local"
                  value={addForm.applied_at}
                  onChange={(e) => setAddForm({ ...addForm, applied_at: e.target.value })}
                  placeholder={toLocalDatetimeInput(new Date())}
                  className="px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid"
                />
              </div>
              <div className="flex flex-col gap-1.5 flex-1 min-w-[140px]">
                <label className="text-[11px] font-semibold uppercase tracking-wide">Notes</label>
                <input
                  type="text"
                  value={addForm.notes}
                  onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })}
                  placeholder="Post-mow"
                  className="px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid focus:ring-2 focus:ring-green-mid/10"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-semibold uppercase tracking-wide">
                Products <span className="text-mist font-normal normal-case">— log a tank mix in one pass</span>
              </label>
              {lines.map((line, i) => {
                const linkedProduct = products.find((p) => p.id === line.productId);
                return (
                  <div key={i} className="flex flex-wrap items-end gap-2">
                    <select
                      value={line.productId}
                      onChange={(e) => updateLine(i, { productId: e.target.value })}
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
                        onChange={(e) => updateLine(i, { customName: e.target.value })}
                        placeholder="Dylox 6.2"
                        className="w-36 px-2 py-1.5 border-[1.5px] border-rule rounded text-xs outline-none focus:border-green-mid"
                      />
                    )}
                    <input
                      type="number"
                      value={line.rei_hours}
                      onChange={(e) => updateLine(i, { rei_hours: e.target.value })}
                      placeholder="REI hrs"
                      className="w-20 px-2 py-1.5 border-[1.5px] border-rule rounded text-xs outline-none focus:border-green-mid"
                    />
                    {linkedProduct && (
                      <input
                        type="number"
                        step="0.01"
                        value={line.quantity_used}
                        onChange={(e) => updateLine(i, { quantity_used: e.target.value })}
                        placeholder={`Qty used (${linkedProduct.unit})`}
                        title={`Deducted from stock (currently ${linkedProduct.current_stock} ${linkedProduct.unit})`}
                        className="w-32 px-2 py-1.5 border-[1.5px] border-rule rounded text-xs outline-none focus:border-green-mid"
                      />
                    )}
                    <input
                      type="number"
                      step="0.01"
                      value={line.cost}
                      onChange={(e) => updateLine(i, { cost: e.target.value })}
                      placeholder="Cost"
                      title={linkedProduct ? "Auto-filled from unit cost × quantity used — editable" : "Cost"}
                      className="w-20 px-2 py-1.5 border-[1.5px] border-rule rounded text-xs outline-none focus:border-green-mid"
                    />
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLine(i)}
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
                onClick={addLine}
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

        {insectApplications.length === 0 ? (
          <div className="p-10 text-center">
            <div className="text-4xl mb-3">🐛</div>
            <div className="text-sm text-mist">No insect applications logged yet. Add your first one above.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="text-[10px] font-mono uppercase tracking-wider text-mist border-b border-rule">
                <th className="text-left px-5 py-2.5 font-medium">Applied At</th>
                <th className="text-left px-3 py-2.5 font-medium">Target</th>
                <th className="text-left px-3 py-2.5 font-medium">Area</th>
                <th className="text-left px-3 py-2.5 font-medium">Product</th>
                <th className="text-left px-3 py-2.5 font-medium">REI</th>
                <th className="text-left px-3 py-2.5 font-medium">Cost</th>
                <th className="text-left px-3 py-2.5 font-medium">Status</th>
                <th className="text-left px-3 py-2.5 font-medium">Notes</th>
                <th className="text-right px-5 py-2.5 font-medium no-print">Actions</th>
              </tr>
            </thead>
            <tbody>
              {insectApplications.map((a) => {
                const appliedMs = new Date(a.applied_at).getTime();
                const clearAt = appliedMs + a.rei_hours * 60 * 60 * 1000;
                const restricted = now < clearAt;
                return (
                  <tr key={a.id} className="border-b border-rule last:border-0">
                    <td className="px-5 py-2.5 text-mist">{new Date(a.applied_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</td>
                    <td className="px-3 py-2.5 font-medium">{a.target}</td>
                    <td className="px-3 py-2.5 text-mist">{a.area || "—"}</td>
                    <td className="px-3 py-2.5">{a.product}</td>
                    <td className="px-3 py-2.5 font-mono">{a.rei_hours}h</td>
                    <td className="px-3 py-2.5 font-mono">{a.cost != null ? `$${Number(a.cost).toFixed(2)}` : "—"}</td>
                    <td className="px-3 py-2.5">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded font-mono ${restricted ? "bg-red/10 text-red" : "bg-green-pale text-green-mid"}`}>
                        {restricted ? "RESTRICTED" : "CLEAR"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-mist">{a.notes || "—"}</td>
                    <td className="px-5 py-2.5 text-right no-print">
                      <button onClick={() => handleDelete(a.id)} className="text-mist text-xs font-semibold hover:text-red">
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </>
  );
}
