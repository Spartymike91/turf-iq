"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";

// One hour of history at 5-minute steps, oldest to newest — matches IEM's
// documented set of pre-rendered lookback layers (nexrad-n0q, then
// nexrad-n0q-m05m through -m55m). There's no arbitrary-timestamp lookup;
// these fixed offsets are the only historical frames IEM serves this way.
const LOOKBACK_MINUTES = [55, 50, 45, 40, 35, 30, 25, 20, 15, 10, 5, 0];
const FRAME_INTERVAL_MS = 600;
const REBUILD_INTERVAL_MS = 5 * 60 * 1000;
const RADAR_OPACITY = 0.65;

function tileUrlFor(minutesAgo: number, cacheBust: number): string {
  const layer = minutesAgo === 0 ? "nexrad-n0q-900913" : `nexrad-n0q-m${String(minutesAgo).padStart(2, "0")}m-900913`;
  return `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/${layer}/{z}/{x}/{y}.png?_cb=${cacheBust}`;
}

export default function RadarMap({ lat, lon }: { lat: number; lon: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(true);
  const playingRef = useRef(playing);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    let cancelled = false;
    let map: import("leaflet").Map | undefined;
    let frameLayers: import("leaflet").TileLayer[] = [];
    let frameIndex = 0;
    let animInterval: ReturnType<typeof setInterval> | undefined;
    let rebuildInterval: ReturnType<typeof setInterval> | undefined;

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
      // (n0q) — same NOAA source data as the National Weather Service
      // forecast this app already pulls from, just a different public
      // service since api.weather.gov itself doesn't serve radar imagery.
      // IEM also pre-renders the trailing hour at 5-minute steps under
      // fixed layer names (nexrad-n0q-m05m, -m10m, ... -m55m), which is
      // what makes a loop possible without an API key or per-timestamp
      // lookup service.
      function buildFrames() {
        if (!map) return;
        const cacheBust = Date.now();
        frameLayers.forEach((l) => l.remove());
        frameLayers = LOOKBACK_MINUTES.map((minutesAgo, i) =>
          L.tileLayer(tileUrlFor(minutesAgo, cacheBust), {
            opacity: i === LOOKBACK_MINUTES.length - 1 ? RADAR_OPACITY : 0,
            maxZoom: 12,
            attribution: "Radar: Iowa Environmental Mesonet (NEXRAD)",
          }).addTo(map!)
        );
        frameIndex = frameLayers.length - 1;
      }

      buildFrames();
      L.marker([lat, lon]).addTo(map);

      animInterval = setInterval(() => {
        if (!playingRef.current || frameLayers.length === 0) return;
        frameLayers[frameIndex].setOpacity(0);
        frameIndex = (frameIndex + 1) % frameLayers.length;
        frameLayers[frameIndex].setOpacity(RADAR_OPACITY);
      }, FRAME_INTERVAL_MS);

      rebuildInterval = setInterval(buildFrames, REBUILD_INTERVAL_MS);
    });

    return () => {
      cancelled = true;
      if (animInterval) clearInterval(animInterval);
      if (rebuildInterval) clearInterval(rebuildInterval);
      map?.remove();
    };
  }, [lat, lon]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full rounded-[10px]" />
      <button
        type="button"
        onClick={() => setPlaying((p) => !p)}
        className="absolute bottom-2.5 right-2.5 z-[1000] w-8 h-8 rounded-full bg-white border border-rule shadow-sm flex items-center justify-center text-ink hover:bg-chalk transition-colors"
        aria-label={playing ? "Pause radar loop" : "Play radar loop"}
      >
        {playing ? "⏸" : "▶"}
      </button>
    </div>
  );
}
