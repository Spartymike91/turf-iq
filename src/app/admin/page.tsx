"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import StatChip from "@/components/ui/StatChip";

interface AdminCourse {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  num_holes: number | null;
  maintained_acres: number | null;
  annual_rounds: number | null;
  created_at: string;
  member_count: number;
  owner: { full_name: string | null; email: string | null } | null;
}

export default function AdminCoursesPage() {
  const [courses, setCourses] = useState<AdminCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/admin/courses");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to load courses.");
      } else {
        setCourses(data.courses ?? []);
      }
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

  if (error) {
    return (
      <div className="bg-red/5 border-[1.5px] border-red/40 rounded-lg px-4 py-3 text-sm text-red">{error}</div>
    );
  }

  const totalMembers = courses.reduce((sum, c) => sum + c.member_count, 0);
  const totalHoles = courses.reduce((sum, c) => sum + (c.num_holes ?? 0), 0);

  return (
    <>
      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-green-forest mb-1">
          Platform Admin
        </div>
        <div className="font-serif text-2xl text-green-dark">All Customers</div>
        <div className="text-[13px] text-mist mt-1">{courses.length} courses on the platform</div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatChip label="Total Courses" value={String(courses.length)} tag="Live" tagColor="ok" />
        <StatChip label="Total Members" value={String(totalMembers)} sub="Across all courses" />
        <StatChip label="Total Holes" value={String(totalHoles)} sub="Combined footprint" />
      </div>

      <div className="bg-white border-[1.5px] border-rule rounded-[10px] overflow-hidden">
        <div className="px-5 py-4 border-b-[1.5px] border-rule font-serif text-lg text-green-dark">
          Courses
        </div>
        {courses.length === 0 ? (
          <div className="p-10 text-center text-sm text-mist">No courses signed up yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-mono uppercase tracking-wider text-mist border-b border-rule">
                <th className="text-left px-5 py-2.5 font-medium">Course</th>
                <th className="text-left px-3 py-2.5 font-medium">Location</th>
                <th className="text-left px-3 py-2.5 font-medium">Owner</th>
                <th className="text-left px-3 py-2.5 font-medium">Holes / Acres</th>
                <th className="text-left px-3 py-2.5 font-medium">Members</th>
                <th className="text-left px-3 py-2.5 font-medium">Signed Up</th>
                <th className="text-right px-5 py-2.5 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {courses.map((c) => (
                <tr key={c.id} className="border-b border-rule last:border-0">
                  <td className="px-5 py-2.5 font-medium">{c.name}</td>
                  <td className="px-3 py-2.5 text-mist">
                    {c.city && c.state ? `${c.city}, ${c.state}` : "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <div>{c.owner?.full_name ?? "—"}</div>
                    <div className="text-mist text-xs">{c.owner?.email ?? "—"}</div>
                  </td>
                  <td className="px-3 py-2.5 text-mist">
                    {c.num_holes ?? "—"} / {c.maintained_acres ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 font-mono">{c.member_count}</td>
                  <td className="px-3 py-2.5 text-mist">
                    {new Date(c.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    <Link href={`/admin/courses/${c.id}`} className="text-green-mid text-xs font-semibold hover:text-green-dark">
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
