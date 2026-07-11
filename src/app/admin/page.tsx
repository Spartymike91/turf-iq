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

const emptyForm = {
  name: "",
  city: "",
  state: "",
  grass_type: "Bermudagrass",
  climate_zone: "warm-humid",
  num_holes: "18",
  maintained_acres: "",
  owner_full_name: "",
  owner_email: "",
};

export default function AdminCoursesPage() {
  const [courses, setCourses] = useState<AdminCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

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

  useEffect(() => {
    load();
  }, []);

  async function handleAddCourse(e: React.FormEvent) {
    e.preventDefault();
    if (!addForm.name || !addForm.owner_email) return;
    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const res = await fetch("/api/admin/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addForm),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create course.");
      } else {
        setNotice(
          data.mode === "invited_new"
            ? `${addForm.name} created — invite email sent to ${addForm.owner_email}.`
            : `${addForm.name} created — ${addForm.owner_email} already had an account and was made owner directly.`
        );
        setAddForm(emptyForm);
        setShowAddForm(false);
        await load();
      }
    } catch {
      setError("Something went wrong creating the course.");
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-mist">Loading...</div>
      </div>
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

      {notice && (
        <div className="bg-green-pale border-[1.5px] border-green-mid/30 rounded-lg px-4 py-2 text-xs text-green-dark">
          {notice}
        </div>
      )}
      {error && (
        <div className="bg-red/5 border-[1.5px] border-red/40 rounded-lg px-4 py-2 text-xs text-red">{error}</div>
      )}

      <div className="bg-white border-[1.5px] border-rule rounded-[10px] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b-[1.5px] border-rule">
          <div className="font-serif text-lg text-green-dark">Courses</div>
          <button
            onClick={() => setShowAddForm((v) => !v)}
            className="px-3.5 py-1.5 bg-green-mid text-white text-xs font-semibold rounded-lg hover:bg-green-dark transition-colors"
          >
            {showAddForm ? "Cancel" : "+ New Course"}
          </button>
        </div>

        {showAddForm && (
          <form
            onSubmit={handleAddCourse}
            className="flex flex-wrap items-end gap-3 px-5 py-4 border-b-[1.5px] border-rule bg-chalk"
          >
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide">Course Name</label>
              <input
                type="text"
                required
                value={addForm.name}
                onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                placeholder="Pebble Creek Golf Club"
                className="w-44 px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide">City</label>
              <input
                type="text"
                value={addForm.city}
                onChange={(e) => setAddForm({ ...addForm, city: e.target.value })}
                placeholder="Atlanta"
                className="w-28 px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide">State</label>
              <input
                type="text"
                value={addForm.state}
                onChange={(e) => setAddForm({ ...addForm, state: e.target.value })}
                placeholder="GA"
                className="w-16 px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide">Holes</label>
              <select
                value={addForm.num_holes}
                onChange={(e) => setAddForm({ ...addForm, num_holes: e.target.value })}
                className="px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid"
              >
                <option>9</option>
                <option>18</option>
                <option>27</option>
                <option>36</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide">Acres</label>
              <input
                type="number"
                value={addForm.maintained_acres}
                onChange={(e) => setAddForm({ ...addForm, maintained_acres: e.target.value })}
                placeholder="63"
                className="w-20 px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide">Owner Name</label>
              <input
                type="text"
                value={addForm.owner_full_name}
                onChange={(e) => setAddForm({ ...addForm, owner_full_name: e.target.value })}
                placeholder="Jordan Reyes"
                className="w-36 px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide">Owner Email</label>
              <input
                type="email"
                required
                value={addForm.owner_email}
                onChange={(e) => setAddForm({ ...addForm, owner_email: e.target.value })}
                placeholder="owner@example.com"
                className="w-48 px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-green-mid text-white text-sm font-semibold rounded-lg hover:bg-green-dark transition-colors disabled:opacity-50"
            >
              {saving ? "Creating..." : "Create Course"}
            </button>
          </form>
        )}

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
