"use client";

import { useState, useEffect, useMemo } from "react";
import Papa from "papaparse";
import { createClient } from "@/lib/supabase/client";
import { resolveCourseIdClient } from "@/lib/supabase/course-context";
import AlertBanner from "@/components/ui/AlertBanner";
import {
  IMPORT_CSV_HEADERS,
  IMPORT_MAX_ROWS,
  validateImportRow,
  matchProductByName,
  type RawImportRow,
  type ValidatedImportRow,
  type ProductLookupItem,
} from "@/lib/applicationImport";
import { CATEGORY_LABEL } from "@/lib/pestCategorization";

const PAGE_SIZE = 50;

interface ImportResult {
  importBatchId: string | null;
  totalRows: number;
  rejected: { index: number; errors: string[] }[];
  insertFailed: { index: number; error: string }[];
  imported: number;
  expensesCreated: number;
  expenseFailed: { index: number; error: string }[];
  byCategory: Record<string, number>;
}

interface RecentImport {
  importBatchId: string;
  count: number;
  totalCost: number;
  importedAt: string;
}

function formatMoney(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatRelativeTime(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}

function UndoButton({ batchId, count, totalCost, onUndone }: { batchId: string; count: number; totalCost: number; onUndone: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [typedConfirm, setTypedConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsTypedConfirm = count >= 50 || totalCost >= 500;

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/applications/import", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ importBatchId: batchId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to undo import.");
      setConfirming(false);
      onUndone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to undo import.");
    }
    setDeleting(false);
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-xs font-semibold text-red hover:underline shrink-0"
      >
        Undo
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1.5 shrink-0">
      {error && <div className="text-[11px] text-red">{error}</div>}
      <div className="text-[11px] text-mist text-right max-w-[220px]">
        This permanently deletes {count} row{count === 1 ? "" : "s"} and {formatMoney(totalCost)} in linked expenses.
      </div>
      {needsTypedConfirm ? (
        <div className="flex items-center gap-1.5">
          <input
            value={typedConfirm}
            onChange={(e) => setTypedConfirm(e.target.value)}
            placeholder='Type "DELETE" to confirm'
            className="w-40 px-2 py-1 border-[1.5px] border-rule rounded text-xs outline-none focus:border-red"
          />
          <button
            type="button"
            disabled={typedConfirm !== "DELETE" || deleting}
            onClick={handleDelete}
            className="px-2.5 py-1 bg-red text-white text-xs font-semibold rounded disabled:opacity-40"
          >
            {deleting ? "Deleting..." : "Delete"}
          </button>
          <button type="button" onClick={() => setConfirming(false)} className="text-xs text-mist hover:text-ink">
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={deleting}
            onClick={handleDelete}
            className="px-2.5 py-1 bg-red text-white text-xs font-semibold rounded disabled:opacity-40"
          >
            {deleting ? "Deleting..." : "Confirm Delete"}
          </button>
          <button type="button" onClick={() => setConfirming(false)} className="text-xs text-mist hover:text-ink">
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

export default function ImportApplicationsPage() {
  const [courseId, setCourseId] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductLookupItem[]>([]);
  const [checking, setChecking] = useState(true);

  const [fileName, setFileName] = useState<string | null>(null);
  const [rawRows, setRawRows] = useState<RawImportRow[]>([]);
  const [headerWarning, setHeaderWarning] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [acknowledgeErrors, setAcknowledgeErrors] = useState(false);

  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [resultTotalCost, setResultTotalCost] = useState(0);

  const [recentImports, setRecentImports] = useState<RecentImport[]>([]);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const context = await resolveCourseIdClient(supabase);
      if (!context) {
        setChecking(false);
        return;
      }
      setCourseId(context.courseId);

      const [{ data: prods }, recentRes] = await Promise.all([
        supabase
          .from("products")
          .select("id, name, category")
          .eq("course_id", context.courseId)
          .eq("is_active", true),
        fetch("/api/applications/import"),
      ]);
      setProducts(prods ?? []);
      if (recentRes.ok) {
        const data = await recentRes.json();
        setRecentImports(data.recentImports ?? []);
      }
      setChecking(false);
    }
    load();
  }, []);

  const validated: ValidatedImportRow[] = useMemo(
    () => rawRows.map((r, i) => validateImportRow(r, i)),
    [rawRows]
  );
  const validRows = validated.filter((v) => v.ok);
  const invalidRows = validated.filter((v) => !v.ok);

  // Error rows pinned first so a handful of bad rows in a large file aren't
  // buried in the paginated preview.
  const orderedRows = useMemo(() => [...invalidRows, ...validRows], [invalidRows, validRows]);
  const pageCount = Math.max(1, Math.ceil(orderedRows.length / PAGE_SIZE));
  const pageRows = orderedRows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  function handleFile(file: File) {
    setFileName(file.name);
    setParseError(null);
    setHeaderWarning(null);
    setResult(null);
    setImportError(null);
    setAcknowledgeErrors(false);
    setPage(0);

    Papa.parse<RawImportRow>(file, {
      header: true,
      skipEmptyLines: true,
      worker: true,
      complete: (results) => {
        const fields = results.meta.fields ?? [];
        const recognized = fields.filter((f) => (IMPORT_CSV_HEADERS as readonly string[]).includes(f));
        if (recognized.length === 0) {
          setHeaderWarning(
            "None of this file's column headers match the template — check you're uploading the right file, or that the header row wasn't removed."
          );
          setRawRows([]);
          return;
        }
        if (results.data.length > IMPORT_MAX_ROWS) {
          setParseError(`This file has ${results.data.length} rows — the max per import is ${IMPORT_MAX_ROWS}. Split it into smaller files.`);
          setRawRows([]);
          return;
        }
        setRawRows(results.data);
      },
      error: (err) => {
        setParseError(err.message || "Failed to parse this file as CSV.");
      },
    });
  }

  async function handleImport() {
    if (!courseId || validRows.length === 0) return;
    setImporting(true);
    setImportError(null);
    try {
      const res = await fetch("/api/applications/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: validRows.map((v) => rawRows[v.index]) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed.");
      const totalCost = validRows.reduce((sum, v) => sum + (v.normalized?.cost ?? 0), 0);
      setResult(data);
      setResultTotalCost(totalCost);
      if (data.importBatchId && data.imported > 0) {
        setRecentImports((prev) => [
          { importBatchId: data.importBatchId, count: data.imported, totalCost, importedAt: new Date().toISOString() },
          ...prev,
        ]);
      }
      setRawRows([]);
      setFileName(null);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed.");
    }
    setImporting(false);
  }

  if (checking) return null;
  if (!courseId) return null;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-green-forest mb-1">Turf Health</div>
        <div className="font-serif text-2xl text-green-dark">Import Application History</div>
        <div className="text-xs text-mist mt-1">
          Upload a CSV of past fertilizer/spray applications instead of logging them one at a time. Costs post to
          Budget under their own historical year, same as a manually-logged application.
        </div>
      </div>

      <div className="bg-white border-[1.5px] border-rule rounded-[10px] p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="font-serif text-base text-green-dark mb-0.5">1. Get the template</div>
            <div className="text-[11px] text-mist">Fill in one row per application, save as CSV, then upload it below.</div>
          </div>
          <a
            href="/templates/application-import-template.csv"
            download
            className="px-3.5 py-1.5 border-[1.5px] border-rule text-ink text-xs font-semibold rounded-lg hover:border-green-mid transition-colors shrink-0"
          >
            Download CSV Template
          </a>
        </div>

        <div className="border-t-[1.5px] border-rule pt-4">
          <div className="font-serif text-base text-green-dark mb-2">2. Upload your file</div>
          <input
            type="file"
            accept=".csv"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
            className="text-xs"
          />
          {fileName && <div className="text-[11px] text-mist mt-1.5">{fileName}</div>}
        </div>

        {parseError && <AlertBanner variant="red" icon="⚠" title="Couldn't read this file" body={parseError} />}
        {headerWarning && <AlertBanner variant="amber" icon="⚠" title="Headers don't match" body={headerWarning} />}

        {rawRows.length > 0 && (
          <div className="border-t-[1.5px] border-rule pt-4 flex flex-col gap-3">
            <div className="font-serif text-base text-green-dark">3. Review</div>
            <div
              className={`text-xs font-semibold px-3.5 py-2 rounded-lg ${
                invalidRows.length === 0 ? "bg-green-pale text-green-dark" : "bg-amber/5 text-[#92400e] border-[1.5px] border-amber/40"
              }`}
            >
              {validRows.length} valid row{validRows.length === 1 ? "" : "s"}
              {invalidRows.length > 0 && `, ${invalidRows.length} row${invalidRows.length === 1 ? "" : "s"} with errors`}
            </div>

            <div className="overflow-x-auto border-[1.5px] border-rule rounded-lg">
              <table className="w-full text-[11px]">
                <thead className="bg-chalk text-mist uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-2.5 py-2">Status</th>
                    <th className="text-left px-2.5 py-2">Date</th>
                    <th className="text-left px-2.5 py-2">Area</th>
                    <th className="text-left px-2.5 py-2">Category</th>
                    <th className="text-left px-2.5 py-2">Product</th>
                    <th className="text-left px-2.5 py-2">Rate / Target</th>
                    <th className="text-left px-2.5 py-2">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((v) => {
                    const raw = rawRows[v.index];
                    const n = v.normalized;
                    const match = n ? matchProductByName(products, n.productName, n.category) : null;
                    return (
                      <tr key={v.index} className="border-t border-rule/60">
                        <td className="px-2.5 py-2 align-top">
                          {v.ok ? (
                            <span className="text-green-mid font-bold">✓</span>
                          ) : (
                            <span className="text-red font-bold" title={v.errors.join("; ")}>
                              ✗
                            </span>
                          )}
                        </td>
                        <td className="px-2.5 py-2 align-top">{n?.date ?? raw.date ?? "—"}</td>
                        <td className="px-2.5 py-2 align-top">{n?.area ?? raw.area ?? "—"}</td>
                        <td className="px-2.5 py-2 align-top">{n ? CATEGORY_LABEL[n.category] : raw.category ?? "—"}</td>
                        <td className="px-2.5 py-2 align-top">
                          {n?.productName ?? raw.product_name ?? "—"}
                          {n && (
                            <div className="text-mist">{match ? `Matched: ${match.name}` : "New / free text"}</div>
                          )}
                        </td>
                        <td className="px-2.5 py-2 align-top">
                          {n?.category === "fertilizer" ? `${n.rateNPer1000} lbs N/M` : n?.target || "—"}
                        </td>
                        <td className="px-2.5 py-2 align-top">{n?.cost != null ? formatMoney(n.cost) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!pageRows.every((v) => v.ok) && (
              <div className="text-[11px] text-mist -mt-1">Hover a ✗ to see the specific error(s) for that row.</div>
            )}

            {pageCount > 1 && (
              <div className="flex items-center gap-2 self-start">
                <button
                  type="button"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-2.5 py-1 border-[1.5px] border-rule rounded text-xs disabled:opacity-40"
                >
                  Prev
                </button>
                <span className="text-xs text-mist">
                  Page {page + 1} of {pageCount}
                </span>
                <button
                  type="button"
                  disabled={page >= pageCount - 1}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-2.5 py-1 border-[1.5px] border-rule rounded text-xs disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}

            {importError && <AlertBanner variant="red" icon="⚠" title="Import failed" body={importError} />}

            <div className="flex items-center gap-3 flex-wrap">
              {invalidRows.length > 0 && (
                <label className="flex items-center gap-2 text-xs text-ink">
                  <input
                    type="checkbox"
                    checked={acknowledgeErrors}
                    onChange={(e) => setAcknowledgeErrors(e.target.checked)}
                  />
                  I understand {invalidRows.length} row{invalidRows.length === 1 ? "" : "s"} with errors will be skipped
                </label>
              )}
              <button
                type="button"
                disabled={validRows.length === 0 || (invalidRows.length > 0 && !acknowledgeErrors) || importing}
                onClick={handleImport}
                className="px-4 py-2 bg-green-mid text-white text-sm font-semibold rounded-lg hover:bg-green-dark transition-colors disabled:opacity-40"
              >
                {importing ? "Importing..." : `Import ${validRows.length} Row${validRows.length === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        )}

        {result && (
          <div className="border-t-[1.5px] border-rule pt-4 flex flex-col gap-2">
            <AlertBanner
              variant="green"
              icon="✓"
              title={`Imported ${result.imported} of ${result.totalRows} rows`}
              body={`${result.expensesCreated} linked expense${result.expensesCreated === 1 ? "" : "s"} created.${
                result.rejected.length > 0 ? ` ${result.rejected.length} row(s) rejected by the server.` : ""
              }${result.insertFailed.length > 0 ? ` ${result.insertFailed.length} row(s) failed to insert.` : ""}${
                result.expenseFailed.length > 0 ? ` ${result.expenseFailed.length} expense(s) failed to record.` : ""
              }`}
            />
            {result.importBatchId && result.imported > 0 && (
              <div className="flex items-center justify-end">
                <UndoButton
                  batchId={result.importBatchId}
                  count={result.imported}
                  totalCost={resultTotalCost}
                  onUndone={() => {
                    setResult(null);
                    setRecentImports((prev) => prev.filter((b) => b.importBatchId !== result.importBatchId));
                  }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-white border-[1.5px] border-rule rounded-[10px] p-5 flex flex-col gap-3">
        <div className="font-serif text-base text-green-dark">Recent Imports</div>
        {recentImports.length === 0 ? (
          <div className="text-xs text-mist">No imports yet.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {recentImports.map((b) => (
              <div key={b.importBatchId} className="flex items-center justify-between gap-3 py-2 border-b border-rule/60 last:border-0">
                <div className="text-xs">
                  <span className="font-semibold text-ink">{b.count} row{b.count === 1 ? "" : "s"}</span>
                  <span className="text-mist"> · {formatMoney(b.totalCost)} · {formatRelativeTime(b.importedAt)}</span>
                </div>
                <UndoButton
                  batchId={b.importBatchId}
                  count={b.count}
                  totalCost={b.totalCost}
                  onUndone={() => setRecentImports((prev) => prev.filter((x) => x.importBatchId !== b.importBatchId))}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
