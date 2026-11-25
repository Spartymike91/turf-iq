"use client";

import { useEffect, useState } from "react";

interface Acceptance {
  id: string;
  accepted_at: string;
  full_name: string | null;
  email: string;
  course_name: string | null;
  course_now: string;
  terms_version: string;
  privacy_version: string;
  source: string;
  ip_address: string | null;
}

export default function AdminAcceptancesPage() {
  const [rows, setRows] = useState<Acceptance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/admin/acceptances");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error ?? "Failed to load records.");
      else setRows(data.acceptances ?? []);
      setLoading(false);
    }
    load();
  }, []);

  return (
    <>
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-green-forest mb-1">Platform Admin</div>
          <div className="font-serif text-2xl text-green-dark">Terms Acceptances</div>
          <div className="text-[13px] text-mist mt-1">Who agreed to the Terms and Privacy Policy, and when</div>
        </div>
        <a
          href="/api/admin/acceptances?format=csv"
          className="px-3.5 py-2 bg-green-mid text-white text-xs font-semibold rounded-lg hover:bg-green-dark transition-colors"
        >
          Download CSV
        </a>
      </div>

      {error && <div className="bg-red/5 border-[1.5px] border-red/40 rounded-lg px-4 py-2 text-xs text-red">{error}</div>}

      <div className="bg-white border-[1.5px] border-rule rounded-[10px] overflow-x-auto shrink-0">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left font-mono uppercase text-[10px] text-mist border-b border-rule">
              {["Date and time", "Name", "Email", "Course", "Version", "How", "IP address"].map((h) => (
                <th key={h} className="px-4 py-2.5 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-rule last:border-0">
                <td className="px-4 py-2 whitespace-nowrap">{new Date(r.accepted_at).toLocaleString("en-US")}</td>
                <td className="px-4 py-2">{r.full_name}</td>
                <td className="px-4 py-2">{r.email}</td>
                <td className="px-4 py-2">{r.course_name ?? r.course_now}</td>
                <td className="px-4 py-2 whitespace-nowrap">
                  {r.terms_version === r.privacy_version
                    ? r.terms_version
                    : `Terms ${r.terms_version} / Privacy ${r.privacy_version}`}
                </td>
                <td className="px-4 py-2">{r.source}</td>
                <td className="px-4 py-2">{r.ip_address}</td>
              </tr>
            ))}
            {!loading && !error && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-mist">
                  No records yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
