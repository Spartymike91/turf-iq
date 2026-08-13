"use client";

import { useState, useEffect, Fragment } from "react";
import StatChip from "@/components/ui/StatChip";

interface AdminError {
  id: string;
  source: "client" | "server";
  message: string;
  stack: string | null;
  url: string | null;
  user_agent: string | null;
  context: Record<string, unknown> | null;
  created_at: string;
  course_id: string | null;
  user_id: string | null;
  courses: { name: string } | null;
}

export default function AdminErrorsPage() {
  const [errors, setErrors] = useState<AdminError[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/admin/errors");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to load errors.");
      } else {
        setErrors(data.errors ?? []);
      }
      setLoadedAt(Date.now());
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-mist">Loading...</div>
      </div>
    );
  }

  const last24h = loadedAt
    ? errors.filter((e) => loadedAt - new Date(e.created_at).getTime() < 24 * 60 * 60 * 1000).length
    : 0;
  const clientCount = errors.filter((e) => e.source === "client").length;
  const serverCount = errors.filter((e) => e.source === "server").length;

  return (
    <>
      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-green-forest mb-1">
          Platform Admin
        </div>
        <div className="font-serif text-2xl text-green-dark">Error Monitoring</div>
        <div className="text-[13px] text-mist mt-1">Most recent {errors.length} errors across all courses</div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatChip
          label="Last 24 Hours"
          value={String(last24h)}
          tag={last24h > 0 ? "Active" : "Quiet"}
          tagColor={last24h > 0 ? "amber" : "ok"}
        />
        <StatChip label="Client Errors" value={String(clientCount)} sub="Browser-side" />
        <StatChip label="Server Errors" value={String(serverCount)} sub="Route / render" />
      </div>

      {error && (
        <div className="bg-red/5 border-[1.5px] border-red/40 rounded-lg px-4 py-2 text-xs text-red">{error}</div>
      )}

      <div className="bg-white border-[1.5px] border-rule rounded-[10px] overflow-hidden shrink-0">
        {errors.length === 0 ? (
          <div className="p-10 text-center text-sm text-mist">No errors logged yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="text-[10px] font-mono uppercase tracking-wider text-mist border-b border-rule">
                  <th className="text-left px-5 py-2.5 font-medium">When</th>
                  <th className="text-left px-3 py-2.5 font-medium">Source</th>
                  <th className="text-left px-3 py-2.5 font-medium">Course</th>
                  <th className="text-left px-3 py-2.5 font-medium">Message</th>
                  <th className="text-left px-3 py-2.5 font-medium">URL</th>
                </tr>
              </thead>
              <tbody>
                {errors.map((e) => (
                  <Fragment key={e.id}>
                    <tr
                      onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}
                      className="border-b border-rule last:border-0 cursor-pointer hover:bg-chalk"
                    >
                      <td className="px-5 py-2.5 text-mist whitespace-nowrap">
                        {new Date(e.created_at).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded ${
                            e.source === "server" ? "bg-red/10 text-red" : "bg-blue/10 text-blue"
                          }`}
                        >
                          {e.source}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-mist">{e.courses?.name ?? "—"}</td>
                      <td className="px-3 py-2.5 max-w-md truncate">{e.message}</td>
                      <td className="px-3 py-2.5 text-mist max-w-xs truncate font-mono text-xs">{e.url ?? "—"}</td>
                    </tr>
                    {expandedId === e.id && (
                      <tr className="border-b border-rule last:border-0 bg-chalk">
                        <td colSpan={5} className="px-5 py-4">
                          {e.stack && (
                            <div className="mb-2">
                              <div className="text-[10px] font-mono uppercase tracking-wide text-mist mb-1">Stack</div>
                              <pre className="text-xs font-mono whitespace-pre-wrap text-ink bg-white border border-rule rounded-lg p-3 max-h-64 overflow-y-auto">
                                {e.stack}
                              </pre>
                            </div>
                          )}
                          {e.context && (
                            <div className="mb-2">
                              <div className="text-[10px] font-mono uppercase tracking-wide text-mist mb-1">Context</div>
                              <pre className="text-xs font-mono whitespace-pre-wrap text-ink bg-white border border-rule rounded-lg p-3">
                                {JSON.stringify(e.context, null, 2)}
                              </pre>
                            </div>
                          )}
                          <div className="text-[11px] text-mist">
                            {e.user_agent && <div>UA: {e.user_agent}</div>}
                            {e.user_id && <div>User ID: {e.user_id}</div>}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
