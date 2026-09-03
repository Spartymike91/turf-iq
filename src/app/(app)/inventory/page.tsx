"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { resolveCourseIdClient } from "@/lib/supabase/course-context";
import StatChip from "@/components/ui/StatChip";
import AlertBanner from "@/components/ui/AlertBanner";
import CurrencyInput from "@/components/ui/CurrencyInput";
import { PRODUCT_CATEGORIES, CATEGORY_LABEL, type ProductCategory } from "@/lib/pestCategorization";

type Category = ProductCategory;

interface Product {
  id: string;
  course_id: string;
  name: string;
  category: Category;
  unit: string;
  unit_cost: number | null;
  current_stock: number;
  reorder_threshold: number | null;
  notes: string | null;
  is_active: boolean;
}

const CATEGORIES: Category[] = [...PRODUCT_CATEGORIES];

const emptyForm = {
  name: "",
  category: "fertilizer" as Category,
  unit: "",
  unit_cost: "",
  current_stock: "",
  reorder_threshold: "",
  notes: "",
};

export default function InventoryPage() {
  const [courseId, setCourseId] = useState<string | null>(null);
  const [courseName, setCourseName] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState(emptyForm);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);

  const [receivingId, setReceivingId] = useState<string | null>(null);
  const [receiveAmount, setReceiveAmount] = useState("");

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const context = await resolveCourseIdClient(supabase);
      if (!context) {
        setChecking(false);
        return;
      }
      setCourseId(context.courseId);

      const [{ data: course }, { data: prods }] = await Promise.all([
        supabase.from("courses").select("name").eq("id", context.courseId).single(),
        supabase
          .from("products")
          .select("*")
          .eq("course_id", context.courseId)
          .eq("is_active", true)
          .order("name"),
      ]);
      setCourseName(course?.name ?? "");
      setProducts(prods ?? []);
      setChecking(false);
    }
    load();
  }, []);

  const lowStock = useMemo(
    () => products.filter((p) => p.reorder_threshold != null && p.current_stock <= p.reorder_threshold),
    [products]
  );
  const totalValue = useMemo(
    () => products.reduce((sum, p) => sum + (p.unit_cost ?? 0) * p.current_stock, 0),
    [products]
  );

  function sortByName(list: Product[]) {
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!courseId || !addForm.name || !addForm.unit) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("products")
      .insert({
        course_id: courseId,
        name: addForm.name,
        category: addForm.category,
        unit: addForm.unit,
        unit_cost: addForm.unit_cost ? parseFloat(addForm.unit_cost) : null,
        current_stock: addForm.current_stock ? parseFloat(addForm.current_stock) : 0,
        reorder_threshold: addForm.reorder_threshold ? parseFloat(addForm.reorder_threshold) : null,
        notes: addForm.notes || null,
      })
      .select()
      .single();
    if (insertError) {
      setError(insertError.message);
    } else if (data) {
      setProducts((prev) => sortByName([...prev, data]));
      setAddForm(emptyForm);
      setShowAdd(false);
    }
    setSaving(false);
  }

  function startEdit(p: Product) {
    setEditingId(p.id);
    setEditForm({
      name: p.name,
      category: p.category,
      unit: p.unit,
      unit_cost: p.unit_cost != null ? String(p.unit_cost) : "",
      current_stock: String(p.current_stock),
      reorder_threshold: p.reorder_threshold != null ? String(p.reorder_threshold) : "",
      notes: p.notes ?? "",
    });
  }

  async function handleSaveEdit(id: string) {
    if (!editForm.name || !editForm.unit) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { data, error: updateError } = await supabase
      .from("products")
      .update({
        name: editForm.name,
        category: editForm.category,
        unit: editForm.unit,
        unit_cost: editForm.unit_cost ? parseFloat(editForm.unit_cost) : null,
        current_stock: editForm.current_stock ? parseFloat(editForm.current_stock) : 0,
        reorder_threshold: editForm.reorder_threshold ? parseFloat(editForm.reorder_threshold) : null,
        notes: editForm.notes || null,
      })
      .eq("id", id)
      .select()
      .single();
    if (updateError) {
      setError(updateError.message);
    } else if (data) {
      setProducts((prev) => sortByName(prev.map((p) => (p.id === id ? data : p))));
      setEditingId(null);
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Remove this product from the directory?")) return;
    const supabase = createClient();
    const { error: deleteError } = await supabase.from("products").delete().eq("id", id);
    if (deleteError) {
      setError(deleteError.message);
    } else {
      setProducts((prev) => prev.filter((p) => p.id !== id));
    }
  }

  function startReceive(p: Product) {
    setReceivingId(p.id);
    setReceiveAmount("");
  }

  async function handleReceive(p: Product) {
    const amount = parseFloat(receiveAmount);
    if (!amount || amount <= 0) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { data, error: updateError } = await supabase
      .from("products")
      .update({ current_stock: Number(p.current_stock) + amount })
      .eq("id", p.id)
      .select()
      .single();
    if (updateError) {
      setError(updateError.message);
    } else if (data) {
      setProducts((prev) => prev.map((x) => (x.id === p.id ? data : x)));
      setReceivingId(null);
    }
    setSaving(false);
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
        <div className="text-sm text-mist">Set up your course profile before tracking inventory.</div>
      </div>
    );
  }

  return (
    <>
      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-green-forest mb-1">
          Product Inventory
        </div>
        <div className="font-serif text-2xl text-green-dark">Chemical &amp; Fertilizer Stock</div>
        <div className="text-[13px] text-mist mt-1">
          {courseName} · {products.length} product{products.length === 1 ? "" : "s"}
        </div>
      </div>

      {lowStock.length > 0 && (
        <AlertBanner
          variant="amber"
          icon="📦"
          title={`${lowStock.length} product${lowStock.length === 1 ? "" : "s"} at or below reorder threshold`}
          body={lowStock.map((p) => `${p.name} (${p.current_stock} ${p.unit} left)`).join(" · ")}
        />
      )}

      {error && (
        <div className="bg-red/5 border-[1.5px] border-red/40 rounded-lg px-4 py-2 text-xs text-red">{error}</div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatChip label="Total Products" value={String(products.length)} tag="Directory" tagColor="ok" />
        <StatChip
          label="Low Stock"
          value={String(lowStock.length)}
          tag={lowStock.length > 0 ? "Reorder" : "Clear"}
          tagColor={lowStock.length > 0 ? "warn" : "ok"}
        />
        <StatChip label="Inventory Value" value={`$${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} sub="At current stock levels" />
      </div>

      <div className="bg-white border-[1.5px] border-rule rounded-[10px] overflow-hidden shrink-0">
        <div className="flex items-center justify-between px-5 py-4 border-b-[1.5px] border-rule">
          <div className="font-serif text-lg text-green-dark">Product Directory</div>
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="px-3.5 py-1.5 bg-green-mid text-white text-xs font-semibold rounded-lg hover:bg-green-dark transition-colors"
          >
            {showAdd ? "Cancel" : "+ Add Product"}
          </button>
        </div>

        {showAdd && (
          <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3 px-5 py-4 border-b-[1.5px] border-rule bg-chalk">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide">Name</label>
              <input
                type="text"
                required
                value={addForm.name}
                onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                placeholder="Urea 46-0-0"
                className="w-40 px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid focus:ring-2 focus:ring-green-mid/10"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide">Category</label>
              <select
                value={addForm.category}
                onChange={(e) => setAddForm({ ...addForm, category: e.target.value as Category })}
                className="px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide">Unit</label>
              <input
                type="text"
                required
                value={addForm.unit}
                onChange={(e) => setAddForm({ ...addForm, unit: e.target.value })}
                placeholder="lb, gal, oz"
                className="w-24 px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid focus:ring-2 focus:ring-green-mid/10"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide">Unit Cost</label>
              <CurrencyInput
                value={addForm.unit_cost}
                onChange={(v) => setAddForm({ ...addForm, unit_cost: v })}
                className="w-24"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide">Starting Stock</label>
              <input
                type="number"
                step="0.01"
                value={addForm.current_stock}
                onChange={(e) => setAddForm({ ...addForm, current_stock: e.target.value })}
                placeholder="0"
                className="w-24 px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid focus:ring-2 focus:ring-green-mid/10"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide">Reorder At</label>
              <input
                type="number"
                step="0.01"
                value={addForm.reorder_threshold}
                onChange={(e) => setAddForm({ ...addForm, reorder_threshold: e.target.value })}
                placeholder="Optional"
                className="w-24 px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid focus:ring-2 focus:ring-green-mid/10"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide">Notes</label>
              <input
                type="text"
                value={addForm.notes}
                onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })}
                placeholder="Optional"
                className="w-40 px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid focus:ring-2 focus:ring-green-mid/10"
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

        {products.length === 0 ? (
          <div className="p-10 text-center">
            <div className="text-4xl mb-3">📦</div>
            <div className="text-sm text-mist">No products yet. Add your first one above.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="text-[10px] font-mono uppercase tracking-wider text-mist border-b border-rule">
                  <th className="text-left px-5 py-2.5 font-medium">Name</th>
                  <th className="text-left px-3 py-2.5 font-medium">Category</th>
                  <th className="text-left px-3 py-2.5 font-medium">Qty on Hand</th>
                  <th className="text-left px-3 py-2.5 font-medium">Unit</th>
                  <th className="text-left px-3 py-2.5 font-medium">Unit Cost</th>
                  <th className="text-left px-3 py-2.5 font-medium">Value</th>
                  <th className="text-right px-5 py-2.5 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const isLow = p.reorder_threshold != null && p.current_stock <= p.reorder_threshold;
                  return editingId === p.id ? (
                    <tr key={p.id} className="border-b border-rule last:border-0 bg-chalk">
                      <td colSpan={7} className="px-5 py-3">
                        <div className="flex flex-wrap items-end gap-2">
                          <input
                            value={editForm.name}
                            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                            className="w-36 px-2 py-1.5 border-[1.5px] border-rule rounded text-xs"
                            placeholder="Name"
                          />
                          <select
                            value={editForm.category}
                            onChange={(e) => setEditForm({ ...editForm, category: e.target.value as Category })}
                            className="px-2 py-1.5 border-[1.5px] border-rule rounded text-xs"
                          >
                            {CATEGORIES.map((c) => (
                              <option key={c} value={c}>
                                {CATEGORY_LABEL[c]}
                              </option>
                            ))}
                          </select>
                          <input
                            value={editForm.unit}
                            onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })}
                            className="w-16 px-2 py-1.5 border-[1.5px] border-rule rounded text-xs"
                            placeholder="Unit"
                          />
                          <input
                            type="number"
                            step="0.01"
                            value={editForm.current_stock}
                            onChange={(e) => setEditForm({ ...editForm, current_stock: e.target.value })}
                            className="w-20 px-2 py-1.5 border-[1.5px] border-rule rounded text-xs"
                            placeholder="Stock"
                          />
                          <CurrencyInput
                            value={editForm.unit_cost}
                            onChange={(v) => setEditForm({ ...editForm, unit_cost: v })}
                            placeholder="Unit cost"
                            compact
                            className="w-20"
                          />
                          <input
                            type="number"
                            step="0.01"
                            value={editForm.reorder_threshold}
                            onChange={(e) => setEditForm({ ...editForm, reorder_threshold: e.target.value })}
                            className="w-24 px-2 py-1.5 border-[1.5px] border-rule rounded text-xs"
                            placeholder="Reorder at"
                          />
                          <button
                            onClick={() => handleSaveEdit(p.id)}
                            disabled={saving}
                            className="px-3 py-1.5 bg-green-mid text-white text-xs font-semibold rounded-lg hover:bg-green-dark transition-colors disabled:opacity-50"
                          >
                            {saving ? "Saving..." : "Save"}
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="px-3 py-1.5 text-mist text-xs font-semibold hover:text-ink"
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={p.id} className="border-b border-rule last:border-0">
                      <td className="px-5 py-2.5 font-medium">
                        {p.name}
                        {p.notes && <div className="text-[11px] text-mist font-normal">{p.notes}</div>}
                      </td>
                      <td className="px-3 py-2.5 text-mist">{CATEGORY_LABEL[p.category]}</td>
                      <td className="px-3 py-2.5">
                        <span className={`font-mono ${isLow ? "text-red font-semibold" : ""}`}>
                          {p.current_stock}
                        </span>
                        {isLow && (
                          <span className="ml-1.5 text-[9px] font-bold bg-red/10 text-red px-1 py-0.5 rounded font-mono">
                            LOW
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-mist">{p.unit}</td>
                      <td className="px-3 py-2.5 font-mono text-mist">
                        {p.unit_cost != null ? `$${Number(p.unit_cost).toFixed(2)}/${p.unit}` : "—"}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-mist">
                        {p.unit_cost != null ? `$${(Number(p.unit_cost) * p.current_stock).toFixed(0)}` : "—"}
                      </td>
                      <td className="px-5 py-2.5 text-right whitespace-nowrap">
                        {receivingId === p.id ? (
                          <span className="inline-flex items-center gap-1.5">
                            <input
                              type="number"
                              step="0.01"
                              autoFocus
                              value={receiveAmount}
                              onChange={(e) => setReceiveAmount(e.target.value)}
                              placeholder={`+ ${p.unit}`}
                              className="w-20 px-2 py-1 border-[1.5px] border-rule rounded text-xs outline-none focus:border-green-mid"
                            />
                            <button
                              onClick={() => handleReceive(p)}
                              disabled={saving}
                              className="text-green-mid text-xs font-semibold hover:text-green-dark"
                            >
                              Add
                            </button>
                            <button
                              onClick={() => setReceivingId(null)}
                              className="text-mist text-xs font-semibold hover:text-ink mr-2"
                            >
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <>
                            <button
                              onClick={() => startReceive(p)}
                              className="text-mist text-xs font-semibold hover:text-green-dark mr-3"
                            >
                              Receive Stock
                            </button>
                            <button
                              onClick={() => startEdit(p)}
                              className="text-mist text-xs font-semibold hover:text-green-dark mr-3"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(p.id)}
                              className="text-mist text-xs font-semibold hover:text-red"
                            >
                              Delete
                            </button>
                          </>
                        )}
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
