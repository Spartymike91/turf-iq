"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

// Refresh cadence for the radar overlay. NEXRAD mosaics update roughly every
// 5-10 minutes; redraw() re-requests the current tiles from the server
// rather than relying on whatever was cached on first load.
const REDRAW_INTERVAL_MS = 5 * 60 * 1000;

export default function RadarMap({ lat, lon }: { lat: number; lon: number }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let map: import("leaflet").Map | undefined;
    let radarLayer: import("leaflet").TileLayer | undefined;
    let interval: ReturnType<typeof setInterval> | undefined;

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

      // Iowa Environmental Mesonet's public NEXRAD base-reflectivity mosaic
      // (n0q) — always serves the current national radar frame at this URL,
      // no API key or station lookup required. Same NOAA source data as the
      // National Weather Service forecast this app already pulls from, just
      // a different public service since api.weather.gov itself doesn't
      // serve radar imagery.
      radarLayer = L.tileLayer(
        "https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913/{z}/{x}/{y}.png",
        { opacity: 0.65, maxZoom: 12, attribution: "Radar: Iowa Environmental Mesonet (NEXRAD)" }
      ).addTo(map);

      L.marker([lat, lon]).addTo(map);

      interval = setInterval(() => radarLayer?.redraw(), REDRAW_INTERVAL_MS);
    });

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      map?.remove();
    };
  }, [lat, lon]);

  return <div ref={containerRef} className="w-full h-full rounded-[10px]" />;
}
