"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { resolveCourseIdClient } from "@/lib/supabase/course-context";
import {
  buildCountdowns,
  forecastGddFromDays,
  type ApplicationRow,
  type Countdown,
  type CountdownStatus,
} from "@/lib/reapplication";

const STATUS_STYLE: Record<CountdownStatus, string> = {
  overdue: "bg-red/10 text-red",
  due: "bg-red/10 text-red",
  soon: "bg-amber-100 text-amber-800",
  ok: "bg-green-pale text-green-dark",
  idle: "bg-chalk text-mist",
};

function countdownLabel(c: Countdown): string {
  if (c.status === "overdue") return `Overdue by ${Math.abs(c.remainingGdd).toFixed(0)} GDD`;
  if (c.status === "due") return "Due now";
  if (c.daysLeft == null) return "Not accumulating";
  if (c.daysLeft >= 90) return "90+ days";
  const days = c.daysLeft === 1 ? "1 day" : `${c.daysLeft} days`;
  return c.estimated ? `~${days}` : days;
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ReapplicationCountdown({ reloadToken = 0 }: { reloadToken?: number }) {
  const [countdowns, setCountdowns] = useState<Countdown[] | null>(null);
  const [forecastMissing, setForecastMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const context = await resolveCourseIdClient(supabase);
      if (!context || cancelled) return;

      const since = new Date();
      since.setFullYear(since.getFullYear() - 1);
      const sinceDate = since.toISOString().slice(0, 10);

      const [{ data: fert }, { data: pest }, weatherRes] = await Promise.all([
        supabase
          .from("fertilizer_applications")
          .select("zone, product, application_date, reapply_gdd")
          .eq("course_id", context.courseId)
          .gte("application_date", sinceDate),
        supabase
          .from("pest_applications")
          .select("area, product, applied_at, reapply_gdd")
          .eq("course_id", context.courseId)
          .gte("applied_at", sinceDate),
        fetch("/api/weather").catch(() => null),
      ]);

      let forecastGdd: number[] = [];
      if (weatherRes && weatherRes.ok) {
        const weather = await weatherRes.json();
        forecastGdd = forecastGddFromDays(weather.forecast ?? []);
      }

      // Read the GDD log only after the weather call returns: that call is what
      // backfills the year's history (first visit) and writes today's row, so
      // querying it in parallel missed both.
      const { data: gddLog } = await supabase
        .from("gdd_daily_log")
        .select("log_date, gdd")
        .eq("course_id", context.courseId)
        .gte("log_date", sinceDate);
      if (cancelled) return;

      const rows: ApplicationRow[] = [
        ...(fert ?? []).map((r) => ({
          area: r.zone as string,
          product: r.product as string,
          appliedOn: r.application_date as string,
          targetGdd: r.reapply_gdd != null ? Number(r.reapply_gdd) : null,
        })),
        ...(pest ?? []).map((r) => ({
          area: r.area as string,
          product: r.product as string,
          appliedOn: (r.applied_at as string).slice(0, 10),
          targetGdd: r.reapply_gdd != null ? Number(r.reapply_gdd) : null,
        })),
      ];

      setForecastMissing(forecastGdd.length === 0);
      const built = buildCountdowns(
        rows,
        (gddLog ?? []).map((r) => ({ log_date: r.log_date as string, gdd: Number(r.gdd) })),
        forecastGdd
      );
      // Soonest due first; overdue/due (0 days) naturally sort to the top.
      built.sort((a, b) => (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity));
      setCountdowns(built);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  if (countdowns === null) return null;

  return (
    <div className="bg-white border-[1.5px] border-rule rounded-[10px] overflow-hidden shrink-0">
      <div className="px-5 py-3.5">
        <div className="font-serif text-base text-green-dark">Reapplication Countdown</div>
        <div className="text-[11px] text-mist">
          Growing degree days (base 50°F) since the last application of each product, per area, against the target you set
          when logging it.
          {forecastMissing && countdowns.length > 0 && " Forecast unavailable — day counts use recent weather."}
        </div>
      </div>
      {countdowns.length === 0 ? (
        <div className="px-5 pb-4 text-xs text-mist border-t border-rule pt-3">
          Nothing to count down yet. Enter a <span className="font-semibold">Reapply GDD</span> on a product line when you
          log an application — or set a default on the product in Inventory — and it&apos;ll show up here.
        </div>
      ) : (
        <div className="overflow-x-auto border-t border-rule">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] font-mono uppercase tracking-wide text-mist">
                <th className="px-5 py-2 font-normal">Area</th>
                <th className="px-3 py-2 font-normal">Product</th>
                <th className="px-3 py-2 font-normal">Last applied</th>
                <th className="px-3 py-2 font-normal">GDD since</th>
                <th className="px-5 py-2 font-normal text-right">Reapply in</th>
              </tr>
            </thead>
            <tbody>
              {countdowns.map((c) => (
                <tr key={`${c.area}|${c.product}`} className="border-t border-rule/60">
                  <td className="px-5 py-2.5 font-medium">{c.area}</td>
                  <td className="px-3 py-2.5">{c.product}</td>
                  <td className="px-3 py-2.5 text-mist">{formatDate(c.appliedOn)}</td>
                  <td className="px-3 py-2.5 font-mono text-xs">
                    {c.accumulatedGdd.toFixed(0)} / {c.targetGdd}
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLE[c.status]}`}>
                      {countdownLabel(c)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
