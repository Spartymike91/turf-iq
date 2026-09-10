"use client";

import { useState, useEffect, useMemo, Fragment } from "react";
import { createClient } from "@/lib/supabase/client";
import { resolveCourseIdClient } from "@/lib/supabase/course-context";
import { resolveGrassTypes } from "@/lib/grassTypes";
import type { ProductCategory } from "@/lib/pestCategorization";
import { printSection } from "@/lib/printSection";
import { groupByAppliedAtAndArea } from "@/lib/applicationGrouping";
import PestApplicationEditRow, { type PestApplicationRow } from "@/components/turf-health/PestApplicationEditRow";

interface Product {
  id: string;
  name: string;
  category: string;
  unit: string;
  unit_cost: number | null;
  current_stock: number;
}

export default function WettingAgentSection() {
  const [courseId, setCourseId] = useState<string | null>(null);
  const [courseName, setCourseName] = useState("");
  const [grassType, setGrassType] = useState<string[]>([]);
  const [applications, setApplications] = useState<PestApplicationRow[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [checking, setChecking] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
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
        .select("name, grass_type, grass_type_greens")
        .eq("id", context.courseId)
        .single();
      setCourseName(course?.name ?? "");
      setGrassType(resolveGrassTypes(course?.grass_type_greens, course?.grass_type));

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
        .order("name");
      setProducts(prods ?? []);

      setChecking(false);
    }
    load();
  }, []);

  // A brand-new category with no legacy rows to reclassify — unlike the
  // other pest_applications-backed tabs, no keyword-heuristic fallback is
  // needed for rows with category IS NULL, since nothing pre-dates this tab.
  const wettingAgentApplications = applications.filter((a) => a.category === "wetting_agent");
  const groups = useMemo(() => groupByAppliedAtAndArea(wettingAgentApplications), [wettingAgentApplications]);

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
        <div className="text-sm text-mist">Set up your course profile before tracking wetting agent applications.</div>
      </div>
    );
  }

  return (
    <>
      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-green-forest mb-1">Wetting Agents</div>
        <div className="font-serif text-2xl text-green-dark">Soil Surfactant &amp; Wetting Agent Applications</div>
        <div className="text-[13px] text-mist mt-1">
          {grassType.join("/") || "—"} · {courseName}
        </div>
      </div>

      <div id="wetting-agent-application-log" className="bg-white border-[1.5px] border-rule rounded-[10px] overflow-hidden shrink-0">
        <div className="flex items-center justify-between px-5 py-4 border-b-[1.5px] border-rule">
          <div className="font-serif text-lg text-green-dark">Application Log — REI Compliance</div>
          <button
            onClick={() => printSection("wetting-agent-application-log")}
            className="px-3.5 py-1.5 border-[1.5px] border-rule text-ink text-xs font-semibold rounded-lg hover:border-green-mid transition-colors no-print"
          >
            Print
          </button>
        </div>

        {wettingAgentApplications.length === 0 ? (
          <div className="p-10 text-center">
            <div className="text-4xl mb-3">💧</div>
            <div className="text-sm text-mist">No wetting agent applications logged yet. Log one from the button above the tabs.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="text-[10px] font-mono uppercase tracking-wider text-mist border-b border-rule">
                <th className="text-left px-5 py-2.5 font-medium">Target</th>
                <th className="text-left px-3 py-2.5 font-medium">Product</th>
                <th className="text-left px-3 py-2.5 font-medium">REI</th>
                <th className="text-left px-3 py-2.5 font-medium">Cost</th>
                <th className="text-left px-3 py-2.5 font-medium">Status</th>
                <th className="text-left px-3 py-2.5 font-medium">Notes</th>
                <th className="text-right px-5 py-2.5 font-medium no-print">Actions</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => {
                const groupCost = group.rows.reduce((sum, a) => sum + Number(a.cost ?? 0), 0);
                return (
                  <Fragment key={group.key}>
                    <tr className="bg-chalk">
                      <td colSpan={7} className="px-5 py-2 text-xs border-b border-rule">
                        <span className="font-mono text-[10px] uppercase tracking-wider text-green-forest font-bold mr-2">
                          {new Date(group.appliedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                        </span>
                        <span className="font-semibold text-ink">{group.area}</span>
                        <span className="text-mist ml-2">
                          {group.rows.length} product{group.rows.length === 1 ? "" : "s"}
                          {groupCost > 0 && ` · $${groupCost.toFixed(2)}`}
                        </span>
                      </td>
                    </tr>
                    {group.rows.map((a) =>
                      editingId === a.id ? (
                        <PestApplicationEditRow
                          key={a.id}
                          app={a}
                          resolvedCategory={(a.category as ProductCategory) ?? "wetting_agent"}
                          products={products}
                          colSpan={7}
                          onCancel={() => setEditingId(null)}
                          onSaved={(updated) => {
                            setApplications((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
                            setEditingId(null);
                          }}
                        />
                      ) : (
                        <tr key={a.id} className="border-b border-rule last:border-0">
                          <td className="px-5 py-2.5 font-medium">{a.target || "—"}</td>
                          <td className="px-3 py-2.5">{a.product}</td>
                          <td className="px-3 py-2.5 font-mono">{a.rei_hours}h</td>
                          <td className="px-3 py-2.5 font-mono">{a.cost != null ? `$${Number(a.cost).toFixed(2)}` : "—"}</td>
                          <td className="px-3 py-2.5">
                            {(() => {
                              const restricted = now < new Date(a.applied_at).getTime() + a.rei_hours * 60 * 60 * 1000;
                              return (
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded font-mono ${restricted ? "bg-red/10 text-red" : "bg-green-pale text-green-mid"}`}>
                                  {restricted ? "RESTRICTED" : "CLEAR"}
                                </span>
                              );
                            })()}
                          </td>
                          <td className="px-3 py-2.5 text-mist">{a.notes || "—"}</td>
                          <td className="px-5 py-2.5 text-right no-print whitespace-nowrap">
                            <button onClick={() => setEditingId(a.id)} className="text-mist text-xs font-semibold hover:text-green-mid mr-3">
                              Edit
                            </button>
                            <button onClick={() => handleDelete(a.id)} className="text-mist text-xs font-semibold hover:text-red">
                              Delete
                            </button>
                          </td>
                        </tr>
                      )
                    )}
                  </Fragment>
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
