"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { createPinIcon } from "./mapPin";

// Trailing hour at 5-minute steps, oldest to newest. NOAA's MRMS layer
// publishes real frames roughly every 2 minutes with `nearestValue` time
// matching enabled, so we don't need to fetch its capabilities to discover
// exact timestamps — any ISO timestamp we ask for snaps to the closest
// actual frame server-side.
const LOOKBACK_MINUTES = [55, 50, 45, 40, 35, 30, 25, 20, 15, 10, 5, 0];
const FRAME_INTERVAL_MS = 600;
const REBUILD_INTERVAL_MS = 5 * 60 * 1000;
const RADAR_OPACITY = 0.75;

const MRMS_WMS_URL = "https://opengeo.ncep.noaa.gov/geoserver/conus/ows";

function isoMinutesAgo(minutesAgo: number): string {
  return new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();
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
    let frameLayers: import("leaflet").TileLayer.WMS[] = [];
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

      // NOAA's public MRMS (Multi-Radar Multi-Sensor) quality-controlled
      // CONUS base reflectivity — a 1km-resolution national mosaic, the
      // same class of product behind radar.weather.gov's national view,
      // and notably higher resolution than the older NEXRAD composite
      // mosaic this used to pull from a third-party mirror.
      function buildFrames() {
        if (!map) return;
        frameLayers.forEach((l) => l.remove());
        frameLayers = LOOKBACK_MINUTES.map((minutesAgo, i) =>
          L.tileLayer.wms(MRMS_WMS_URL, {
            layers: "conus:conus_bref_qcd",
            format: "image/png",
            transparent: true,
            version: "1.3.0",
            time: isoMinutesAgo(minutesAgo),
            opacity: i === LOOKBACK_MINUTES.length - 1 ? RADAR_OPACITY : 0,
            maxZoom: 12,
            attribution: "Radar: NOAA MRMS",
          } as L.WMSOptions).addTo(map!)
        );
        frameIndex = frameLayers.length - 1;
      }

      buildFrames();
      L.marker([lat, lon], { icon: createPinIcon(L) }).addTo(map);

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
