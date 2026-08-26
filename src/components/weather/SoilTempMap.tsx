"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";

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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const IMAGE_URL = `${SUPABASE_URL}/storage/v1/object/public/soil-temp/latest.png`;
const META_URL = `${SUPABASE_URL}/storage/v1/object/public/soil-temp/latest.json`;

interface SoilTempMeta {
  validAt: string;
  generatedAt: string;
}

export default function SoilTempMap({ lat, lon }: { lat: number; lon: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [meta, setMeta] = useState<SoilTempMeta | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    fetch(`${META_URL}?t=${Date.now()}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then(setMeta)
      .catch(() => setLoadFailed(true));
  }, []);

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

      L.marker([lat, lon]).addTo(map);
    });

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [lat, lon]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full rounded-[10px]" />
      {loadFailed && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/90 rounded-[10px]">
          <div className="text-sm text-mist text-center px-6">
            Soil temperature map isn&apos;t available right now — it refreshes every 6 hours.
          </div>
        </div>
      )}
      <div className="absolute bottom-2.5 left-2.5 z-[1000] bg-white/95 border border-rule rounded-md px-2 py-1.5 shadow-sm">
        <div className="flex h-2 w-32 rounded overflow-hidden">
          {COLOR_STOPS.map(([, color]) => (
            <div key={color} className="flex-1" style={{ background: color }} />
          ))}
        </div>
        <div className="flex justify-between text-[9px] font-mono text-mist mt-0.5">
          <span>20°F</span>
          <span>72°F</span>
          <span>115°F+</span>
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
  );
}
