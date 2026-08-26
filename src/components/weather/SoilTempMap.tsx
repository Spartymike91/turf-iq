"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { createPinIcon } from "./mapPin";

// Kept in sync with scripts/render_soil_temp.py's TOP_LAT/BOTTOM_LAT/LEFT_LON/RIGHT_LON
// and COLOR_STOPS — this component only displays what that script renders,
// it doesn't compute anything itself.
const BOUNDS: [[number, number], [number, number]] = [
  [24.0, -125.0],
  [50.0, -65.0],
];
const IMAGE_OPACITY = 0.75;

const COLOR_STOPS: [number, string][] = [
  [20, "rgb(76,0,115)"],
  [32, "rgb(49,54,149)"],
  [45, "rgb(69,117,180)"],
  [55, "rgb(116,173,209)"],
  [65, "rgb(171,217,233)"],
  [72, "rgb(255,255,191)"],
  [80, "rgb(254,224,144)"],
  [88, "rgb(253,174,97)"],
  [95, "rgb(244,109,67)"],
  [105, "rgb(215,48,39)"],
  [115, "rgb(165,0,38)"],
];

const LEGEND_LABELS = ["20°", "45°", "72°", "95°", "115°F+"];

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const IMAGE_URL = `${SUPABASE_URL}/storage/v1/object/public/soil-temp/latest.png`;
const META_URL = `${SUPABASE_URL}/storage/v1/object/public/soil-temp/latest.json`;

interface SoilTempMeta {
  validAt: string;
  generatedAt: string;
}

interface SoilTempSummary {
  current: number;
  avg24h: number;
  avg5d: number;
}

// Open-Meteo's 6cm depth is the closest single point-value match to the
// GFS 0-0.1m (0-4in) layer the map itself renders — the 0cm "skin"
// temperature swings too fast hour-to-hour to be a useful readout for
// turf root-zone conditions.
async function fetchSoilTempSummary(lat: number, lon: number): Promise<SoilTempSummary | null> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=soil_temperature_6cm&temperature_unit=fahrenheit&timezone=auto&past_days=5&forecast_days=1`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const times: string[] = data?.hourly?.time ?? [];
    const values: Array<number | null> = data?.hourly?.soil_temperature_6cm ?? [];

    const nowMs = Date.now();
    let idx = -1;
    for (let i = 0; i < times.length; i++) {
      if (new Date(times[i]).getTime() <= nowMs) idx = i;
      else break;
    }
    if (idx < 0) idx = values.length - 1;
    const current = values[idx];
    if (idx < 0 || current == null) return null;

    const averageOverLast = (hours: number): number | null => {
      const slice = values.slice(Math.max(0, idx - hours + 1), idx + 1).filter((v): v is number => v != null);
      if (!slice.length) return null;
      return slice.reduce((sum, v) => sum + v, 0) / slice.length;
    };

    const avg24h = averageOverLast(24);
    const avg5d = averageOverLast(24 * 5);
    if (avg24h == null || avg5d == null) return null;

    return {
      current: Math.round(current * 10) / 10,
      avg24h: Math.round(avg24h * 10) / 10,
      avg5d: Math.round(avg5d * 10) / 10,
    };
  } catch {
    return null;
  }
}

export default function SoilTempMap({ lat, lon }: { lat: number; lon: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [meta, setMeta] = useState<SoilTempMeta | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [summary, setSummary] = useState<SoilTempSummary | null>(null);

  useEffect(() => {
    fetch(`${META_URL}?t=${Date.now()}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then(setMeta)
      .catch(() => setLoadFailed(true));
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchSoilTempSummary(lat, lon).then((result) => {
      if (!cancelled) setSummary(result);
    });
    return () => {
      cancelled = true;
    };
  }, [lat, lon]);

  useEffect(() => {
    let cancelled = false;
    let map: import("leaflet").Map | undefined;

    import("leaflet").then((L) => {
      if (cancelled || !containerRef.current) return;

      map = L.map(containerRef.current, {
        center: [lat, lon],
        zoom: 8,
        scrollWheelZoom: false,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 12,
      }).addTo(map);

      const overlay = L.imageOverlay(`${IMAGE_URL}?t=${Date.now()}`, BOUNDS, {
        opacity: IMAGE_OPACITY,
      });
      overlay.on("error", () => setLoadFailed(true));
      overlay.addTo(map);

      L.marker([lat, lon], { icon: createPinIcon(L) }).addTo(map);
    });

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [lat, lon]);

  return (
    <div className="flex flex-col w-full h-full">
      <div className="flex items-center gap-4 sm:gap-6 px-3 py-2 border-b border-rule bg-cream/60 shrink-0">
        <div className="text-[10px] uppercase tracking-wide text-mist">At your course</div>
        {summary ? (
          <>
            <Stat label="Current" value={summary.current} emphasize />
            <Stat label="24-Hr Avg" value={summary.avg24h} />
            <Stat label="5-Day Avg" value={summary.avg5d} />
          </>
        ) : (
          <div className="text-[11px] text-mist">Loading soil temperature…</div>
        )}
      </div>
      <div className="relative flex-1 min-h-0">
        <div ref={containerRef} className="w-full h-full" />
        {loadFailed && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/90">
            <div className="text-sm text-mist text-center px-6">
              Soil temperature map isn&apos;t available right now — it refreshes every 6 hours.
            </div>
          </div>
        )}
        <div className="absolute bottom-2.5 left-2.5 z-[1000] bg-white/95 border border-rule rounded-md px-2 py-1.5 shadow-sm">
          <div className="flex h-2 w-40 rounded overflow-hidden">
            {COLOR_STOPS.map(([, color]) => (
              <div key={color} className="flex-1" style={{ background: color }} />
            ))}
          </div>
          <div className="flex justify-between text-[9px] font-mono text-mist mt-0.5 w-40">
            {LEGEND_LABELS.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
        </div>
        {meta && (
          <div className="absolute top-2.5 right-2.5 z-[1000] bg-white/95 border border-rule rounded-md px-2 py-1 text-[10px] font-mono text-mist">
            As of{" "}
            {new Date(meta.validAt).toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
              timeZoneName: "short",
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, emphasize }: { label: string; value: number; emphasize?: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[10px] text-mist">{label}</span>
      <span className={emphasize ? "text-[15px] font-semibold text-green-dark" : "text-[13px] text-green-dark"}>
        {Math.round(value)}°F
      </span>
    </div>
  );
}
