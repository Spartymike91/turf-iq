import type { SupabaseClient } from "@supabase/supabase-js";

const NWS_USER_AGENT = "TurfIQ Golf Course Management (https://turfiq.app, support@turfiq.app)";

interface NwsForecastPeriod {
  number: number;
  name: string;
  startTime: string;
  isDaytime: boolean;
  temperature: number;
  shortForecast: string;
  probabilityOfPrecipitation: { value: number | null };
}

interface NwsObservationProps {
  timestamp: string;
  temperature: { value: number | null };
  dewpoint: { value: number | null };
  relativeHumidity: { value: number | null };
  windSpeed: { value: number | null };
  windDirection: { value: number | null };
  textDescription: string | null;
}

export interface ForecastDay {
  dow: string;
  isToday: boolean;
  icon: string;
  description: string;
  hiF: number;
  loF: number;
  precipChance: number | null;
}

export interface WeatherResult {
  location: { city: string; state: string; lat: number | null; lon: number | null };
  current: {
    tempF: number;
    description: string;
    humidity: number | null;
    windSpeed: number | null;
    windDirection: string | null;
    highF: number;
    lowF: number;
  };
  forecast: ForecastDay[];
  agronomics: {
    et0In: number;
    et0WeekIn: number;
    gddToday: number;
    gddSeasonToDate: number;
    leafWetnessHours: number;
    weekRainfallIn: number;
    rainfallYtdIn: number;
    rainfallYtdAvgIn: number | null;
  };
  diseaseRisk: {
    dollarSpot: {
      probabilityPct: number;
      meanTempF: number;
      meanHumidity: number;
      inValidRange: boolean;
      actionThresholdPct: number;
    };
    pythium: {
      elevated: boolean;
      maxTempF: number;
      minTempF: number;
      hoursRhAbove90: number;
    };
    brownPatch: {
      elevated: boolean;
      overnightLowF: number;
      hoursRhAbove95: number;
    };
  };
  updatedAt: string;
}

interface CourseForWeather {
  id: string;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
}

const cToF = (c: number) => (c * 9) / 5 + 32;
const kmhToMph = (k: number) => k * 0.621371;

const COMPASS_DIRS = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
];

function degToCompass(deg: number): string {
  return COMPASS_DIRS[Math.round(deg / 22.5) % 16];
}

function iconForForecast(shortForecast: string): string {
  const s = shortForecast.toLowerCase();
  if (s.includes("thunder")) return "⛈️";
  if (s.includes("snow")) return "❄️";
  if (s.includes("rain") || s.includes("shower")) return "🌧️";
  if (s.includes("fog") || s.includes("haze")) return "🌫️";
  if (s.includes("cloud") && s.includes("partly")) return "⛅";
  if (s.includes("cloud") || s.includes("overcast")) return "☁️";
  if (s.includes("wind")) return "💨";
  if (s.includes("clear") || s.includes("sunny")) return "☀️";
  return "⛅";
}

const US_STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  DC: "District of Columbia",
};

async function geocodeCityState(city: string, state: string): Promise<{ lat: number; lon: number }> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
    city
  )}&count=10&country=US&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Geocoding request failed");
  const data = await res.json();
  const results = data?.results as Array<{ latitude: number; longitude: number; admin1?: string }> | undefined;
  if (!results || results.length === 0) {
    throw new Error(`Could not determine coordinates for "${city}, ${state}"`);
  }

  const stateName = US_STATE_NAMES[state.toUpperCase()] ?? state;
  const match = results.find((r) => r.admin1 === stateName) ?? results[0];
  return { lat: match.latitude, lon: match.longitude };
}

async function nwsFetch(url: string) {
  const res = await fetch(url, {
    headers: { "User-Agent": NWS_USER_AGENT, Accept: "application/geo+json" },
  });
  if (!res.ok) throw new Error(`NWS request failed (${res.status}): ${url}`);
  return res.json();
}

// Covers the Dollar Spot model's 120h trailing average plus buffer for the
// Pythium/Brown Patch 24h + overnight windows.
const OBS_HISTORY_HOURS = 150;

async function fetchNwsWeather(lat: number, lon: number) {
  const points = await nwsFetch(`https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`);
  const { forecast, forecastGridData, observationStations } = points.properties;

  const [forecastData, gridData, stationsData] = await Promise.all([
    nwsFetch(forecast),
    nwsFetch(forecastGridData),
    nwsFetch(observationStations),
  ]);

  const stationUrl = stationsData.features?.[0]?.id;
  if (!stationUrl) throw new Error("No observation station found near this location");

  const start = new Date(Date.now() - OBS_HISTORY_HOURS * 60 * 60 * 1000).toISOString();
  const [latestObs, obsHistory] = await Promise.all([
    nwsFetch(`${stationUrl}/observations/latest`),
    nwsFetch(`${stationUrl}/observations?start=${start}&limit=500`),
  ]);

  return {
    forecastPeriods: forecastData.properties.periods as NwsForecastPeriod[],
    grid: gridData.properties as {
      quantitativePrecipitation?: { values: Array<{ validTime: string; value: number | null }> };
    },
    latestObs: latestObs.properties as NwsObservationProps,
    obsHistory: obsHistory.features as Array<{ properties: NwsObservationProps }>,
  };
}

function buildForecast(periods: NwsForecastPeriod[]): ForecastDay[] {
  const days: ForecastDay[] = [];
  const dayPeriods = periods.filter((p) => p.isDaytime);

  for (let i = 0; i < Math.min(7, dayPeriods.length); i++) {
    const day = dayPeriods[i];
    const dayIndex = periods.indexOf(day);
    const night = periods[dayIndex + 1];
    const date = new Date(day.startTime);
    days.push({
      dow: date.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase(),
      isToday: i === 0,
      icon: iconForForecast(day.shortForecast),
      description: day.shortForecast,
      hiF: day.temperature,
      loF: night?.temperature ?? day.temperature,
      precipChance:
        day.probabilityOfPrecipitation?.value ?? night?.probabilityOfPrecipitation?.value ?? null,
    });
  }
  return days;
}

/** Growing Degree Days, base 50°F. */
export function computeGdd(highF: number, lowF: number): number {
  return Math.max(0, (highF + lowF) / 2 - 50);
}

/**
 * Reference evapotranspiration (ET0) via the FAO-56 Hargreaves equation —
 * an approximation used when full station data (solar radiation, wind,
 * vapor pressure) isn't available; needs only temps, latitude, and day-of-year.
 */
export function computeEt0(highF: number, lowF: number, latDeg: number, dayOfYear: number): number {
  const tmax = ((highF - 32) * 5) / 9;
  const tmin = ((lowF - 32) * 5) / 9;
  const tmean = (tmax + tmin) / 2;
  const phi = (latDeg * Math.PI) / 180;
  const dr = 1 + 0.033 * Math.cos((2 * Math.PI * dayOfYear) / 365);
  const decl = 0.409 * Math.sin((2 * Math.PI * dayOfYear) / 365 - 1.39);
  const sunsetAngleArg = Math.max(-1, Math.min(1, -Math.tan(phi) * Math.tan(decl)));
  const omega = Math.acos(sunsetAngleArg);
  const raMj =
    ((24 * 60) / Math.PI) *
    0.082 *
    dr *
    (omega * Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.sin(omega));
  const raMm = raMj / 2.45;
  const et0Mm = 0.0023 * (tmean + 17.8) * Math.sqrt(Math.max(0, tmax - tmin)) * raMm;
  return et0Mm / 25.4;
}

type Obs = { properties: NwsObservationProps };

function trailingHours(obsHistory: Obs[], hours: number, now: number): Obs[] {
  const cutoff = now - hours * 60 * 60 * 1000;
  return obsHistory.filter((f) => {
    const t = new Date(f.properties.timestamp).getTime();
    return t >= cutoff && t <= now;
  });
}

/** Estimated leaf wetness duration: hours where temp/dewpoint spread <= ~3°F (1.67°C). */
function computeLeafWetnessHours(obsHistory: Obs[], now: number): number {
  let count = 0;
  for (const f of trailingHours(obsHistory, 16, now)) {
    const t = f.properties.temperature?.value;
    const d = f.properties.dewpoint?.value;
    if (t == null || d == null) continue;
    if (t - d <= 1.67) count++;
  }
  return count;
}

/**
 * Dollar Spot risk via the Smith, Kerns & Koch (2018) logistic model
 * (PLOS ONE, DOI 10.1371/journal.pone.0194216), independently confirmed by
 * UW-Madison Turfgrass Diagnostic Lab, Asian Turfgrass Center, and U. Delaware
 * Extension. Uses a 5-day (120h) trailing average of hourly temp/RH.
 */
function computeDollarSpotRisk(obsHistory: Obs[], now: number) {
  const window = trailingHours(obsHistory, 120, now);
  const temps = window.map((f) => f.properties.temperature?.value).filter((v): v is number => v != null);
  const rhs = window.map((f) => f.properties.relativeHumidity?.value).filter((v): v is number => v != null);

  const meanTempC = temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : 0;
  const meanRH = rhs.length ? rhs.reduce((a, b) => a + b, 0) / rhs.length : 0;

  const logit = -11.4041 + 0.0894 * meanRH + 0.1932 * meanTempC;
  const probabilityPct = (1 / (1 + Math.exp(-logit))) * 100;

  return {
    probabilityPct: Math.round(probabilityPct * 10) / 10,
    meanTempF: Math.round(cToF(meanTempC)),
    meanHumidity: Math.round(meanRH),
    inValidRange: meanTempC >= 10 && meanTempC <= 35,
    actionThresholdPct: 20,
  };
}

/**
 * Pythium Blight — Nutter-Shane rule-based threshold model: elevated risk when
 * trailing-24h max temp > 86°F and min temp > 68°F, with RH >= 90% sustained
 * for 14+ of those hours. A coarser boolean heuristic, not a statistical model.
 */
function computePythiumRisk(obsHistory: Obs[], now: number) {
  const window = trailingHours(obsHistory, 24, now);
  const temps = window.map((f) => f.properties.temperature?.value).filter((v): v is number => v != null);
  const maxTempF = temps.length ? Math.round(cToF(Math.max(...temps))) : 0;
  const minTempF = temps.length ? Math.round(cToF(Math.min(...temps))) : 0;
  const hoursRhAbove90 = window.filter((f) => (f.properties.relativeHumidity?.value ?? 0) >= 90).length;

  return {
    elevated: maxTempF > 86 && minTempF > 68 && hoursRhAbove90 >= 14,
    maxTempF,
    minTempF,
    hoursRhAbove90,
  };
}

/**
 * Brown Patch — qualitative extension heuristic (no formal validated model
 * exists): conditions favorable when trailing-24h low temp > 68°F and RH >= 95%
 * sustained for 6+ hours.
 */
function computeBrownPatchRisk(obsHistory: Obs[], now: number) {
  const window = trailingHours(obsHistory, 24, now);
  const temps = window.map((f) => f.properties.temperature?.value).filter((v): v is number => v != null);
  const overnightLowF = temps.length ? Math.round(cToF(Math.min(...temps))) : 0;
  const hoursRhAbove95 = window.filter((f) => (f.properties.relativeHumidity?.value ?? 0) >= 95).length;

  return {
    elevated: overnightLowF > 68 && hoursRhAbove95 >= 6,
    overnightLowF,
    hoursRhAbove95,
  };
}

function sumWeeklyRainfallIn(grid: {
  quantitativePrecipitation?: { values: Array<{ validTime: string; value: number | null }> };
}): number {
  const values = grid.quantitativePrecipitation?.values ?? [];
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  let totalMm = 0;
  for (const v of values) {
    if (v.value == null) continue;
    const start = new Date(v.validTime.split("/")[0]).getTime();
    if (start >= now && start <= now + weekMs) {
      totalMm += v.value;
    }
  }
  return totalMm / 25.4;
}

/**
 * Actual daily rainfall backfill/refresh via Open-Meteo's forecast API
 * (`past_days`) — used instead of the NWS station observations already
 * fetched above because point-station METAR precipitation fields are
 * frequently null even in clear weather (a known ASOS reporting gap), while
 * Open-Meteo's blended model/reanalysis daily totals are gap-free. Refreshes
 * the last 10 days on every fetch (so "today" keeps updating through the
 * day and any short gap in usage self-heals), independent of the once-ever
 * full-year backfill below.
 */
async function refreshRecentRainfall(
  supabase: SupabaseClient,
  courseId: string,
  lat: number,
  lon: number,
  todayStr: string
): Promise<void> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=precipitation_sum&timezone=auto&past_days=10&forecast_days=1`;
  const res = await fetch(url);
  if (!res.ok) return;
  const data = await res.json();
  const dates: string[] = data?.daily?.time ?? [];
  const mm: Array<number | null> = data?.daily?.precipitation_sum ?? [];

  const rows = dates
    .map((date, i) => ({ date, mmVal: mm[i] }))
    .filter((r) => r.date <= todayStr)
    .map((r) => ({
      course_id: courseId,
      log_date: r.date,
      rainfall_in: Math.round(((r.mmVal ?? 0) / 25.4) * 100) / 100,
    }));

  if (rows.length) {
    await supabase.from("rainfall_daily_log").upsert(rows, { onConflict: "course_id,log_date" });
  }
}

/**
 * Fills any gap between the once-ever Jan-1 GDD backfill (which only
 * reaches to ~6 days ago) and yesterday — without this, those few days
 * would only ever get logged if the app happened to be opened on each of
 * them specifically, the same gap rainfall already avoids via
 * refreshRecentRainfall. Deliberately excludes today: gddToday (and its
 * stored row) already comes from the NWS forecast the rest of the page
 * uses, so overwriting it here with Open-Meteo's number would make the
 * displayed "+X today" figure disagree with what's summed into the season
 * total.
 */
async function refreshRecentGdd(
  supabase: SupabaseClient,
  courseId: string,
  lat: number,
  lon: number,
  todayStr: string
): Promise<void> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&timezone=auto&past_days=10&forecast_days=1`;
  const res = await fetch(url);
  if (!res.ok) return;
  const data = await res.json();
  const dates: string[] = data?.daily?.time ?? [];
  const highs: Array<number | null> = data?.daily?.temperature_2m_max ?? [];
  const lows: Array<number | null> = data?.daily?.temperature_2m_min ?? [];

  const rows = dates
    .map((date, i) => ({ date, high: highs[i], low: lows[i] }))
    .filter((r) => r.date < todayStr && r.high != null && r.low != null)
    .map((r) => ({
      course_id: courseId,
      log_date: r.date,
      gdd: Math.round(computeGdd(r.high as number, r.low as number) * 100) / 100,
    }));

  if (rows.length) {
    await supabase.from("gdd_daily_log").upsert(rows, { onConflict: "course_id,log_date" });
  }
}

/**
 * One-time (per course) backfill of Jan 1 → ~6 days ago using Open-Meteo's
 * archive API (real historical reanalysis, not a forecast) — gives every
 * course true full-calendar-year actual rainfall immediately, even one
 * adopting the app mid-season, rather than only counting days tracked since
 * setup. Only runs when this year's log doesn't already reach back near
 * Jan 1, so it's not re-fetched on every page load once filled in.
 */
async function ensureRainfallYearBackfilled(
  supabase: SupabaseClient,
  courseId: string,
  lat: number,
  lon: number,
  now: Date
): Promise<void> {
  const yearStart = `${now.getFullYear()}-01-01`;
  const { data: earliestThisYear } = await supabase
    .from("rainfall_daily_log")
    .select("log_date")
    .eq("course_id", courseId)
    .gte("log_date", yearStart)
    .order("log_date", { ascending: true })
    .limit(1)
    .maybeSingle();

  const cutoff = `${now.getFullYear()}-01-06`;
  if (earliestThisYear?.log_date && earliestThisYear.log_date <= cutoff) return;

  const archiveEnd = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (archiveEnd < yearStart) return;

  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${yearStart}&end_date=${archiveEnd}&daily=precipitation_sum&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) return;
  const data = await res.json();
  const dates: string[] = data?.daily?.time ?? [];
  const mm: Array<number | null> = data?.daily?.precipitation_sum ?? [];

  const rows = dates.map((date, i) => ({
    course_id: courseId,
    log_date: date,
    rainfall_in: Math.round(((mm[i] ?? 0) / 25.4) * 100) / 100,
  }));

  if (rows.length) {
    await supabase.from("rainfall_daily_log").upsert(rows, { onConflict: "course_id,log_date" });
  }
}

/**
 * One-time (per course) backfill of Jan 1 → ~6 days ago for season-to-date
 * GDD, using the same Open-Meteo archive approach as the rainfall backfill —
 * without this, a course that signs up mid-season only ever accumulates GDD
 * from its setup date forward, understating the true season total.
 */
async function ensureGddYearBackfilled(
  supabase: SupabaseClient,
  courseId: string,
  lat: number,
  lon: number,
  now: Date
): Promise<void> {
  const yearStart = `${now.getFullYear()}-01-01`;
  const { data: earliestThisYear } = await supabase
    .from("gdd_daily_log")
    .select("log_date")
    .eq("course_id", courseId)
    .gte("log_date", yearStart)
    .order("log_date", { ascending: true })
    .limit(1)
    .maybeSingle();

  const cutoff = `${now.getFullYear()}-01-06`;
  if (earliestThisYear?.log_date && earliestThisYear.log_date <= cutoff) return;

  const archiveEnd = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (archiveEnd < yearStart) return;

  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${yearStart}&end_date=${archiveEnd}&daily=temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) return;
  const data = await res.json();
  const dates: string[] = data?.daily?.time ?? [];
  const highs: Array<number | null> = data?.daily?.temperature_2m_max ?? [];
  const lows: Array<number | null> = data?.daily?.temperature_2m_min ?? [];

  const rows = dates
    .map((date, i) => ({ date, high: highs[i], low: lows[i] }))
    .filter((r) => r.high != null && r.low != null)
    .map((r) => ({
      course_id: courseId,
      log_date: r.date,
      gdd: Math.round(computeGdd(r.high as number, r.low as number) * 100) / 100,
    }));

  if (rows.length) {
    await supabase.from("gdd_daily_log").upsert(rows, { onConflict: "course_id,log_date" });
  }
}

const REFERENCE_YEAR_DAYS = (() => {
  const days: string[] = [];
  const d = new Date(Date.UTC(2001, 0, 1)); // 2001 is not a leap year — exactly 365 days
  while (d.getUTCFullYear() === 2001) {
    days.push(d.toISOString().slice(5, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return days;
})();

/**
 * One-time (per course) 10-year historical daily-average rainfall, computed
 * from Open-Meteo's archive API and cached indefinitely as a running
 * cumulative-from-Jan-1 total per calendar day — climate normals don't
 * change day to day, so this never needs recomputing once it exists.
 */
async function ensureRainfallNormals(
  supabase: SupabaseClient,
  courseId: string,
  lat: number,
  lon: number
): Promise<void> {
  const { count } = await supabase
    .from("course_rainfall_normals")
    .select("*", { count: "exact", head: true })
    .eq("course_id", courseId);
  if (count && count > 0) return;

  const thisYear = new Date().getFullYear();
  const startYear = thisYear - 10;
  const endYear = thisYear - 1;
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${startYear}-01-01&end_date=${endYear}-12-31&daily=precipitation_sum&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) return;
  const data = await res.json();
  const dates: string[] = data?.daily?.time ?? [];
  const mm: Array<number | null> = data?.daily?.precipitation_sum ?? [];
  if (dates.length === 0) return;

  const byMonthDay = new Map<string, number[]>();
  dates.forEach((date, i) => {
    const monthDay = date.slice(5);
    const list = byMonthDay.get(monthDay) ?? [];
    list.push(mm[i] ?? 0);
    byMonthDay.set(monthDay, list);
  });

  const orderedDays = byMonthDay.has("02-29")
    ? [...REFERENCE_YEAR_DAYS.slice(0, REFERENCE_YEAR_DAYS.indexOf("02-28") + 1), "02-29", ...REFERENCE_YEAR_DAYS.slice(REFERENCE_YEAR_DAYS.indexOf("02-28") + 1)]
    : REFERENCE_YEAR_DAYS;

  let cumulativeMm = 0;
  const rows = orderedDays.map((monthDay) => {
    const vals = byMonthDay.get(monthDay) ?? [];
    const avgMm = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    cumulativeMm += avgMm;
    return {
      course_id: courseId,
      month_day: monthDay,
      cumulative_avg_in: Math.round((cumulativeMm / 25.4) * 100) / 100,
    };
  });

  await supabase.from("course_rainfall_normals").upsert(rows, { onConflict: "course_id,month_day" });
}

const CACHE_TTL_MS = 15 * 60 * 1000;

export async function getWeatherForCourse(
  supabase: SupabaseClient,
  course: CourseForWeather
): Promise<WeatherResult> {
  const { data: cached } = await supabase
    .from("weather_cache")
    .select("data, fetched_at")
    .eq("course_id", course.id)
    .maybeSingle();

  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < CACHE_TTL_MS) {
    return cached.data as WeatherResult;
  }

  try {
    const result = await fetchFreshWeather(supabase, course);
    await supabase
      .from("weather_cache")
      .upsert(
        { course_id: course.id, data: result, fetched_at: new Date().toISOString() },
        { onConflict: "course_id" }
      );
    return result;
  } catch (error) {
    if (cached) {
      console.error("Weather refresh failed, serving stale cache:", error);
      return cached.data as WeatherResult;
    }
    throw error;
  }
}

async function fetchFreshWeather(
  supabase: SupabaseClient,
  course: CourseForWeather
): Promise<WeatherResult> {
  if (!course.city || !course.state) {
    throw new Error("Course location (city/state) is not set yet.");
  }

  let lat = course.latitude;
  let lon = course.longitude;

  if (lat == null || lon == null) {
    const geo = await geocodeCityState(course.city, course.state);
    lat = geo.lat;
    lon = geo.lon;
    await supabase.from("courses").update({ latitude: lat, longitude: lon }).eq("id", course.id);
  }

  const { forecastPeriods, grid, latestObs, obsHistory } = await fetchNwsWeather(lat, lon);

  const now = new Date();
  const dayOfYear = Math.floor(
    (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000
  );

  const forecast = buildForecast(forecastPeriods);
  const today = forecast[0];
  if (!today) throw new Error("No forecast data returned for this location");

  const gddToday = computeGdd(today.hiF, today.loF);
  const et0In = computeEt0(today.hiF, today.loF, lat, dayOfYear);
  const et0WeekIn = forecast.reduce(
    (sum, day, i) => sum + computeEt0(day.hiF, day.loF, lat, dayOfYear + i),
    0
  );
  const leafWetnessHours = computeLeafWetnessHours(obsHistory, now.getTime());
  const weekRainfallIn = sumWeeklyRainfallIn(grid);
  const dollarSpot = computeDollarSpotRisk(obsHistory, now.getTime());
  const pythium = computePythiumRisk(obsHistory, now.getTime());
  const brownPatch = computeBrownPatchRisk(obsHistory, now.getTime());

  const todayStr = now.toISOString().slice(0, 10);
  await supabase
    .from("gdd_daily_log")
    .upsert(
      { course_id: course.id, log_date: todayStr, gdd: gddToday },
      { onConflict: "course_id,log_date", ignoreDuplicates: true }
    );

  await supabase
    .from("disease_risk_daily_log")
    .upsert(
      {
        course_id: course.id,
        log_date: todayStr,
        dollar_spot_pct: dollarSpot.probabilityPct,
        dollar_spot_above_threshold: dollarSpot.probabilityPct >= dollarSpot.actionThresholdPct,
        pythium_elevated: pythium.elevated,
        brown_patch_elevated: brownPatch.elevated,
      },
      { onConflict: "course_id,log_date", ignoreDuplicates: true }
    );

  try {
    await refreshRecentGdd(supabase, course.id, lat, lon, todayStr);
    await ensureGddYearBackfilled(supabase, course.id, lat, lon, now);
  } catch (err) {
    console.error("GDD backfill failed (non-fatal):", err);
  }

  const yearStart = `${now.getFullYear()}-01-01`;
  const { data: gddRows } = await supabase
    .from("gdd_daily_log")
    .select("gdd")
    .eq("course_id", course.id)
    .gte("log_date", yearStart);
  const gddSeasonToDate = (gddRows ?? []).reduce((sum, r) => sum + Number(r.gdd), 0);

  try {
    await refreshRecentRainfall(supabase, course.id, lat, lon, todayStr);
    await ensureRainfallYearBackfilled(supabase, course.id, lat, lon, now);
    await ensureRainfallNormals(supabase, course.id, lat, lon);
  } catch (err) {
    console.error("Rainfall tracking update failed (non-fatal):", err);
  }

  const { data: rainRows } = await supabase
    .from("rainfall_daily_log")
    .select("rainfall_in")
    .eq("course_id", course.id)
    .gte("log_date", yearStart)
    .lte("log_date", todayStr);
  const rainfallYtdIn =
    Math.round((rainRows ?? []).reduce((sum, r) => sum + Number(r.rainfall_in), 0) * 100) / 100;

  const { data: normalRow } = await supabase
    .from("course_rainfall_normals")
    .select("cumulative_avg_in")
    .eq("course_id", course.id)
    .eq("month_day", todayStr.slice(5))
    .maybeSingle();
  const rainfallYtdAvgIn = normalRow ? Number(normalRow.cumulative_avg_in) : null;

  const tempC = latestObs.temperature?.value;
  const humidity = latestObs.relativeHumidity?.value != null
    ? Math.round(latestObs.relativeHumidity.value)
    : null;
  const windKmh = latestObs.windSpeed?.value;
  const windDirDeg = latestObs.windDirection?.value;

  return {
    location: { city: course.city, state: course.state, lat, lon },
    current: {
      tempF: tempC != null ? Math.round(cToF(tempC)) : today.hiF,
      description: latestObs.textDescription || "—",
      humidity,
      windSpeed: windKmh != null ? Math.round(kmhToMph(windKmh)) : null,
      windDirection: windDirDeg != null ? degToCompass(windDirDeg) : null,
      highF: today.hiF,
      lowF: today.loF,
    },
    forecast,
    agronomics: {
      et0In: Math.round(et0In * 100) / 100,
      et0WeekIn: Math.round(et0WeekIn * 100) / 100,
      gddToday: Math.round(gddToday * 10) / 10,
      gddSeasonToDate: Math.round(gddSeasonToDate * 10) / 10,
      leafWetnessHours,
      weekRainfallIn: Math.round(weekRainfallIn * 100) / 100,
      rainfallYtdIn,
      rainfallYtdAvgIn,
    },
    diseaseRisk: {
      dollarSpot,
      pythium,
      brownPatch,
    },
    updatedAt: now.toISOString(),
  };
}
