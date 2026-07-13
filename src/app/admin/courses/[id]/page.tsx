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
  plan_tier: string | null;
  subscription_status: string | null;
  trial_end: string | null;
  current_period_end: string | null;
  billing_waived_until: string | null;
  billing_waived_at: string | null;
  billing_waived_by_name: string | null;
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

const TIER_NAME: Record<string, string> = {
  agronomist: "Agronomist",
  superintendent: "Superintendent",
  complete: "Complete",
};

const STATUS_TAG: Record<string, "ok" | "warn" | "amber" | "blue"> = {
  trialing: "blue",
  active: "ok",
  past_due: "amber",
  canceled: "warn",
  unpaid: "warn",
  incomplete: "amber",
  incomplete_expired: "warn",
  paused: "amber",
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

  const [waiveMonths, setWaiveMonths] = useState(1);
  const [waiving, setWaiving] = useState(false);
  const [billingNotice, setBillingNotice] = useState<string | null>(null);

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

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleWaive() {
    setWaiving(true);
    setBillingNotice(null);
    const res = await fetch(`/api/admin/courses/${id}/waive-billing`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ months: waiveMonths }),
    });
    const data = await res.json();
    if (res.ok) {
      setBillingNotice(`Fee waived until ${new Date(data.billing_waived_until).toLocaleDateString()}.`);
      await load();
    } else {
      setBillingNotice(data.error ?? "Could not waive fee.");
    }
    setWaiving(false);
  }

  async function handleClearWaiver() {
    setWaiving(true);
    setBillingNotice(null);
    await fetch(`/api/admin/courses/${id}/waive-billing`, { method: "DELETE" });
    await load();
    setWaiving(false);
  }

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

  const hasActiveWaiver = !!course.billing_waived_until && new Date(course.billing_waived_until) > new Date();
  const isTrialing = course.subscription_status === "trialing" && !!course.trial_end;

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
        <div className="font-serif text-lg text-green-dark mb-3">Billing</div>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <StatChip label="Plan" value={course.plan_tier ? TIER_NAME[course.plan_tier] ?? course.plan_tier : "None"} />
          <StatChip
            label="Status"
            value={course.subscription_status ?? "No subscription"}
            tag={course.subscription_status ?? undefined}
            tagColor={course.subscription_status ? STATUS_TAG[course.subscription_status] ?? "blue" : "warn"}
          />
          <StatChip
            label={isTrialing ? "Trial Ends" : "Renews"}
            value={
              isTrialing
                ? new Date(course.trial_end as string).toLocaleDateString()
                : course.current_period_end
                ? new Date(course.current_period_end).toLocaleDateString()
                : "—"
            }
          />
        </div>

        {hasActiveWaiver ? (
          <div className="bg-green-pale border-[1.5px] border-green-mid rounded-lg p-3 flex items-center justify-between">
            <div className="text-sm">
              Fee waived until <strong>{new Date(course.billing_waived_until as string).toLocaleDateString()}</strong>
              {course.billing_waived_by_name && <> by {course.billing_waived_by_name}</>}
              {course.billing_waived_at && <> on {new Date(course.billing_waived_at).toLocaleDateString()}</>}.
            </div>
            <button
              onClick={handleClearWaiver}
              disabled={waiving}
              className="text-xs font-semibold text-red hover:underline disabled:opacity-50"
            >
              Clear Waiver
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <select
              value={waiveMonths}
              onChange={(e) => setWaiveMonths(Number(e.target.value))}
              className="px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid"
            >
              {Array.from({ length: 13 }, (_, i) => i).map((m) => (
                <option key={m} value={m}>
                  {m === 0 ? "0 months (none)" : `${m} ${m === 1 ? "month" : "months"}`}
                </option>
              ))}
            </select>
            <button
              onClick={handleWaive}
              disabled={waiving}
              className="px-4 py-2 bg-green-mid text-white font-semibold text-sm rounded-lg hover:bg-green-dark transition-colors disabled:opacity-50"
            >
              {waiving ? "Waiving..." : "Waive Fee"}
            </button>
          </div>
        )}
        {billingNotice && <div className="text-xs text-mist mt-2">{billingNotice}</div>}
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
