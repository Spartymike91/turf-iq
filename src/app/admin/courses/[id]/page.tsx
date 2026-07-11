"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import StatChip from "@/components/ui/StatChip";

interface Course {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  climate_zone: string | null;
  grass_type: string | null;
  num_holes: number | null;
  maintained_acres: number | null;
  annual_rounds: number | null;
  created_at: string;
}

interface RosterRow {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
}

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  superintendent: "Superintendent",
  assistant: "Assistant",
  crew_lead: "Crew Lead",
  crew: "Crew",
};

export default function AdminCourseDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [course, setCourse] = useState<Course | null>(null);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [employeeCount, setEmployeeCount] = useState(0);
  const [taskCount, setTaskCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/admin/courses/${id}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to load course.");
      } else {
        setCourse(data.course);
        setRoster(data.roster ?? []);
        setEmployeeCount(data.employee_count ?? 0);
        setTaskCount(data.task_count ?? 0);
      }
      setLoading(false);
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-mist">Loading...</div>
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="bg-red/5 border-[1.5px] border-red/40 rounded-lg px-4 py-3 text-sm text-red">
        {error ?? "Course not found."}
      </div>
    );
  }

  return (
    <>
      <div>
        <Link href="/admin" className="text-xs text-green-mid font-semibold hover:text-green-dark">
          ← All Customers
        </Link>
        <div className="font-serif text-2xl text-green-dark mt-2">{course.name}</div>
        <div className="text-[13px] text-mist mt-1">
          {course.city && course.state ? `${course.city}, ${course.state}` : "Location not set"} · Signed up{" "}
          {new Date(course.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <StatChip label="Holes" value={String(course.num_holes ?? "—")} />
        <StatChip label="Maintained Acres" value={String(course.maintained_acres ?? "—")} />
        <StatChip label="Employees" value={String(employeeCount)} sub="Labor roster" />
        <StatChip label="Tasks Logged" value={String(taskCount)} sub="All-time assignments" />
      </div>

      <div className="bg-white border-[1.5px] border-rule rounded-[10px] p-5">
        <div className="font-serif text-lg text-green-dark mb-3">Course Profile</div>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-mist mb-1">Grass Type</div>
            <div>{course.grass_type ?? "Not set"}</div>
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-mist mb-1">Climate Zone</div>
            <div>{course.climate_zone ?? "Not set"}</div>
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-mist mb-1">Annual Rounds</div>
            <div>{course.annual_rounds ?? "Not set"}</div>
          </div>
        </div>
      </div>

      <div className="bg-white border-[1.5px] border-rule rounded-[10px] overflow-hidden">
        <div className="px-5 py-4 border-b-[1.5px] border-rule font-serif text-lg text-green-dark">
          Team Roster ({roster.length})
        </div>
        {roster.length === 0 ? (
          <div className="p-10 text-center text-sm text-mist">No team members yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-mono uppercase tracking-wider text-mist border-b border-rule">
                <th className="text-left px-5 py-2.5 font-medium">Name</th>
                <th className="text-left px-3 py-2.5 font-medium">Email</th>
                <th className="text-left px-3 py-2.5 font-medium">Phone</th>
                <th className="text-left px-3 py-2.5 font-medium">Role</th>
                <th className="text-left px-5 py-2.5 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((m) => (
                <tr key={m.id} className="border-b border-rule last:border-0">
                  <td className="px-5 py-2.5 font-medium">{m.full_name ?? "—"}</td>
                  <td className="px-3 py-2.5 text-mist">{m.email ?? "—"}</td>
                  <td className="px-3 py-2.5 text-mist">{m.phone ?? "—"}</td>
                  <td className="px-3 py-2.5">
                    <span className="text-[10px] font-mono uppercase tracking-wide bg-green-pale text-green-mid px-1.5 py-0.5 rounded">
                      {ROLE_LABEL[m.role] ?? m.role}
                    </span>
                  </td>
                  <td className="px-5 py-2.5 text-mist">
                    {new Date(m.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
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
