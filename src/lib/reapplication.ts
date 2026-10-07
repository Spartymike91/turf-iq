// GDD-based reapplication countdown (Robert's #9). Pure functions so the math
// is checkable without a browser: the component feeds in applications, the
// course's daily GDD log (base 50F, same gdd_daily_log everything else uses)
// and the forecast's future daily GDD.

export interface ApplicationRow {
  area: string;
  product: string;
  appliedOn: string; // YYYY-MM-DD
  targetGdd: number | null;
}

export interface GddLogRow {
  log_date: string; // YYYY-MM-DD
  gdd: number;
}

export type CountdownStatus = "overdue" | "due" | "soon" | "ok" | "idle";

export interface Countdown {
  area: string;
  product: string;
  appliedOn: string;
  targetGdd: number;
  accumulatedGdd: number;
  remainingGdd: number;
  // Whole days until due; null when GDD isn't accumulating (cold weather) or
  // no forecast was available to project from.
  daysLeft: number | null;
  // True when the day count had to be extrapolated past the forecast horizon.
  estimated: boolean;
  status: CountdownStatus;
}

// Below this, a "daily average" is too small to project days from — in a cold
// snap 50 GDD would otherwise read as hundreds of days.
const MIN_DAILY_GDD = 0.5;
const SOON_DAYS = 3;
const MAX_DAYS = 90;

/** Only the newest application per area + product counts, and only if it carries a target. */
export function latestWithTargets(rows: ApplicationRow[]): (ApplicationRow & { targetGdd: number })[] {
  const latest = new Map<string, ApplicationRow>();
  for (const row of rows) {
    const key = `${row.area}|${row.product.trim().toLowerCase()}`;
    const current = latest.get(key);
    if (!current || row.appliedOn > current.appliedOn) latest.set(key, row);
  }
  return [...latest.values()].filter(
    (r): r is ApplicationRow & { targetGdd: number } => r.targetGdd != null && r.targetGdd > 0
  );
}

export function buildCountdowns(
  rows: ApplicationRow[],
  gddLog: GddLogRow[],
  // Daily GDD for each upcoming day, starting tomorrow (today is already in the log).
  forecastGdd: number[]
): Countdown[] {
  const recent = [...gddLog].sort((a, b) => (a.log_date < b.log_date ? 1 : -1)).slice(0, 7);
  const recentAvg = recent.length ? recent.reduce((s, r) => s + Number(r.gdd), 0) / recent.length : 0;
  const forecastAvg = forecastGdd.length ? forecastGdd.reduce((s, g) => s + g, 0) / forecastGdd.length : 0;
  // Beyond the forecast horizon, trust the forecast's own pace when we have one.
  const projectedAvg = forecastGdd.length ? forecastAvg : recentAvg;

  return latestWithTargets(rows).map((row) => {
    // The application day itself is excluded — only heat after it counts.
    const accumulated = gddLog
      .filter((r) => r.log_date > row.appliedOn)
      .reduce((sum, r) => sum + Number(r.gdd), 0);
    const remaining = row.targetGdd - accumulated;

    const base = {
      area: row.area,
      product: row.product,
      appliedOn: row.appliedOn,
      targetGdd: row.targetGdd,
      accumulatedGdd: Math.round(accumulated * 10) / 10,
      remainingGdd: Math.round(remaining * 10) / 10,
    };

    if (remaining <= 0) {
      return { ...base, daysLeft: 0, estimated: false, status: remaining < 0 ? ("overdue" as const) : ("due" as const) };
    }

    let cumulative = 0;
    for (let i = 0; i < forecastGdd.length; i++) {
      cumulative += forecastGdd[i];
      if (cumulative >= remaining) {
        return { ...base, daysLeft: i + 1, estimated: false, status: i + 1 <= SOON_DAYS ? ("soon" as const) : ("ok" as const) };
      }
    }

    if (projectedAvg < MIN_DAILY_GDD) {
      return { ...base, daysLeft: null, estimated: true, status: "idle" as const };
    }
    const days = Math.min(MAX_DAYS, forecastGdd.length + Math.ceil((remaining - cumulative) / projectedAvg));
    return { ...base, daysLeft: days, estimated: true, status: days <= SOON_DAYS ? ("soon" as const) : ("ok" as const) };
  });
}

// Same formula as computeGdd in weather.ts (base 50F), duplicated on purpose:
// that module pulls in server-only code and this one runs in the browser.
export function forecastGddFromDays(days: { hiF: number; loF: number; isToday: boolean }[]): number[] {
  return days.filter((d) => !d.isToday).map((d) => Math.max(0, (d.hiF + d.loF) / 2 - 50));
}
