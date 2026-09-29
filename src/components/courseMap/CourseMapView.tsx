"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type * as LType from "leaflet";

export interface CourseMapNote {
  id: string;
  lat: number;
  lng: number;
  category: string;
  note: string;
  shape_points?: [number, number][] | null;
}

// Small fixed palette, same spirit as EVENT_COLORS in MonthCalendar.tsx —
// not user-customizable, just enough to tell pin types apart at a glance.
export const NOTE_CATEGORIES: { value: string; label: string; color: string }[] = [
  { value: "general", label: "General", color: "#6b7280" },
  { value: "irrigation", label: "Irrigation", color: "#2563eb" },
  { value: "turf_issue", label: "Turf Issue", color: "#dc2626" },
  { value: "maintenance", label: "Maintenance", color: "#ea580c" },
];

export function categoryColor(category: string): string {
  return NOTE_CATEGORIES.find((c) => c.value === category)?.color ?? NOTE_CATEGORIES[0].color;
}

export function categoryLabel(category: string): string {
  return NOTE_CATEGORIES.find((c) => c.value === category)?.label ?? "General";
}

// Leaflet's default marker icon resolves its PNG assets via a relative path
// computed at runtime, which breaks under Turbopack/webpack (see
// src/components/weather/mapPin.ts, the earlier fix for this same issue) —
// an inline SVG sidesteps it. A small dot rather than a teardrop pin, since
// a course map can end up with several notes close together.
function createDotIcon(L: typeof LType, color: string) {
  const svg = `<svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="8" fill="${color}" stroke="white" stroke-width="2.5"/></svg>`;
  return L.divIcon({ html: svg, className: "", iconSize: [20, 20], iconAnchor: [10, 10] });
}

// Purely presentational, same split as MonthCalendar.tsx / tasks/status —
// owns only the Leaflet map lifecycle and click/marker events; the popup,
// form state, and CRUD all live in the page that renders this.
export default function CourseMapView({
  center,
  notes,
  canAdd,
  drawMode,
  onMapClick,
  onMarkerClick,
  onShapeComplete,
  onDrawCancel,
  debug,
}: {
  center: { lat: number; lng: number };
  notes: CourseMapNote[];
  canAdd: boolean;
  // Parent owns entering/exiting draw mode (its own "+ Draw Zone" button,
  // matching where every other manager-only control on this page lives) —
  // this just tells CourseMapView "map clicks add polygon vertices right
  // now instead of dropping a pin." Once true, CourseMapView owns the
  // actual vertex collection, live preview, and a small Finish/Cancel
  // toolbar itself, since all of that needs direct, repeated access to the
  // map's own coordinate conversion (screenPointFor) that only this
  // component has. Desktop-only for now (Mike's call, same reasoning as
  // the day-coloring feature's right-click-only scope) — no touch handling
  // is wired up for the drawing interaction itself.
  drawMode: boolean;
  onMapClick?: (lat: number, lng: number, clientX: number, clientY: number) => void;
  onMarkerClick: (noteId: string, clientX: number, clientY: number) => void;
  // Fires when the manager finishes tracing a zone (Finish Shape, >=3
  // points) — points plus a centroid (used the same way a pin's lat/lng
  // is: popup positioning, list display) and a screen position so the
  // parent can open the same add-note popup used for a single-click pin.
  onShapeComplete?: (points: [number, number][], centerLat: number, centerLng: number, clientX: number, clientY: number) => void;
  // Fires on Cancel or Escape — parent should just set drawMode back to
  // false; CourseMapView clears its own in-progress points either way.
  onDrawCancel?: () => void;
  // Temporary, opt-in (?debug=1) on-screen event log — added specifically
  // to diagnose a real-iPhone-only "tap does nothing" report that
  // couldn't be reproduced with any available testing tool (desktop
  // Chrome, mobile viewport emulation). Safe to delete once that's
  // resolved; nothing here runs unless debug is explicitly true.
  debug?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LType.Map | undefined>(undefined);
  const markersLayerRef = useRef<LType.LayerGroup | undefined>(undefined);
  const drawPreviewLayerRef = useRef<LType.Polyline | undefined>(undefined);
  const onMapClickRef = useRef(onMapClick);
  const onMarkerClickRef = useRef(onMarkerClick);
  const onShapeCompleteRef = useRef(onShapeComplete);
  const onDrawCancelRef = useRef(onDrawCancel);
  const canAddRef = useRef(canAdd);
  const drawModeRef = useRef(drawMode);
  const [mapReady, setMapReady] = useState(false);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  // In-progress vertices for the shape currently being traced — lives here
  // rather than in the parent page (unlike the note form/category/text/CRUD,
  // which stay in the parent as always) because both the live preview and
  // the final centroid/screen-position handoff need this component's own
  // coordinate conversion (screenPointFor), not just the raw lat/lng data.
  const [drawPoints, setDrawPoints] = useState<[number, number][]>([]);

  function logDebug(msg: string) {
    if (!debug) return;
    const line = `${new Date().toLocaleTimeString("en-US", { hour12: false })} ${msg}`;
    setDebugLog((prev) => [...prev.slice(-24), line]);
  }

  useEffect(() => {
    onMapClickRef.current = onMapClick;
    onMarkerClickRef.current = onMarkerClick;
    onShapeCompleteRef.current = onShapeComplete;
    onDrawCancelRef.current = onDrawCancel;
    canAddRef.current = canAdd;
    drawModeRef.current = drawMode;
  }, [onMapClick, onMarkerClick, onShapeComplete, onDrawCancel, canAdd, drawMode]);

  useEffect(() => {
    if (!drawMode) return;
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setDrawPoints([]);
        onDrawCancelRef.current?.();
      }
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [drawMode]);

  function cancelDrawing() {
    setDrawPoints([]);
    onDrawCancelRef.current?.();
  }

  function finishShape() {
    if (drawPoints.length < 3 || !mapRef.current) return;
    const avgLat = drawPoints.reduce((sum, [lat]) => sum + lat, 0) / drawPoints.length;
    const avgLng = drawPoints.reduce((sum, [, lng]) => sum + lng, 0) / drawPoints.length;
    const map = mapRef.current;
    const containerRect = map.getContainer().getBoundingClientRect();
    const point = map.latLngToContainerPoint([avgLat, avgLng]);
    const points = drawPoints;
    setDrawPoints([]);
    onShapeCompleteRef.current?.(points, avgLat, avgLng, containerRect.left + point.x, containerRect.top + point.y);
  }

  // Converts a Leaflet lat/lng to a viewport screen position (for
  // positioning the React popup) via Leaflet's own coordinate API rather
  // than trusting the triggering DOM event's clientX/clientY — Leaflet adds
  // a "leaflet-touch" mode on trackpads it detects as touch-capable
  // (common on Macs/Safari even without a touchscreen), and in that mode
  // the click event's originalEvent can be a TouchEvent, which has no
  // top-level clientX/clientY at all. That silently produced an
  // off-screen/NaN-positioned popup on Safari even though the click itself
  // registered fine.
  function screenPointFor(latlng: LType.LatLng): { x: number; y: number } | null {
    const map = mapRef.current;
    if (!map) return null;
    const containerRect = map.getContainer().getBoundingClientRect();
    const point = map.latLngToContainerPoint(latlng);
    return { x: containerRect.left + point.x, y: containerRect.top + point.y };
  }

  useEffect(() => {
    let cancelled = false;

    import("leaflet").then((L) => {
      if (cancelled || !containerRef.current) return;

      // scrollWheelZoom: false matches RadarMap.tsx/SoilTempMap.tsx — without
      // it, scrolling with the cursor anywhere over the map (which is most of
      // the viewport) zooms the map instead of scrolling the page past it, so
      // the notes list below becomes unreachable by the most natural scroll
      // gesture. The +/- buttons remain for zooming.
      const map = L.map(containerRef.current, { center: [center.lat, center.lng], zoom: 17, scrollWheelZoom: false });
      mapRef.current = map;

      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { attribution: "Tiles &copy; Esri", maxZoom: 20 }
      ).addTo(map);

      markersLayerRef.current = L.layerGroup().addTo(map);

      // Raw DOM listeners, independent of Leaflet's own click handling —
      // these fire (or don't) regardless of whether Leaflet successfully
      // turns a touch into a synthesized click, which is exactly the
      // ambiguity this debug mode exists to resolve.
      if (debug && containerRef.current) {
        const el = containerRef.current;
        el.addEventListener("touchstart", (e) => logDebug(`touchstart (${e.touches.length} touch)`));
        el.addEventListener("touchend", (e) => logDebug(`touchend (${e.changedTouches.length} touch)`));
        el.addEventListener("touchcancel", () => logDebug("touchcancel"));
        el.addEventListener("click", (e) => logDebug(`native click @ ${Math.round(e.clientX)},${Math.round(e.clientY)}`));
      }

      map.on("click", (e: LType.LeafletMouseEvent) => {
        if (drawModeRef.current) {
          logDebug(`draw vertex lat=${e.latlng.lat.toFixed(5)} lng=${e.latlng.lng.toFixed(5)}`);
          setDrawPoints((prev) => [...prev, [e.latlng.lat, e.latlng.lng]]);
          return;
        }
        logDebug(`leaflet click canAdd=${canAddRef.current} lat=${e.latlng.lat.toFixed(5)} lng=${e.latlng.lng.toFixed(5)}`);
        if (!canAddRef.current || !onMapClickRef.current) return;
        const screenPoint = screenPointFor(e.latlng);
        if (!screenPoint) {
          logDebug("screenPointFor returned null");
          return;
        }
        logDebug(`opening popup @ ${Math.round(screenPoint.x)},${Math.round(screenPoint.y)}`);
        onMapClickRef.current(e.latlng.lat, e.latlng.lng, screenPoint.x, screenPoint.y);
      });

      logDebug(
        `map ready — touch=${"ontouchstart" in window} maxTouchPoints=${navigator.maxTouchPoints} viewport=${window.innerWidth}x${window.innerHeight}`
      );
      setMapReady(true);
    });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = undefined;
      markersLayerRef.current = undefined;
      drawPreviewLayerRef.current = undefined;
    };
    // Deliberately mount-only: re-running this on every center change would
    // reset whatever pan/zoom the user is currently looking at (e.g. right
    // after they save a new note).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapReady || !markersLayerRef.current) return;
    const layer = markersLayerRef.current;
    import("leaflet").then((L) => {
      layer.clearLayers();
      notes.forEach((n) => {
        const color = categoryColor(n.category);
        // A drawn zone renders as its actual traced outline instead of a
        // dot — same click behavior either way (opens the same view popup),
        // since course_map_notes.shape_points is purely additive: every
        // existing pin note has it null and keeps rendering exactly as
        // before.
        const layerObj: LType.Layer =
          n.shape_points && n.shape_points.length >= 3
            ? L.polygon(n.shape_points, { color, weight: 2, fillColor: color, fillOpacity: 0.25 })
            : L.marker([n.lat, n.lng], { icon: createDotIcon(L, color) });
        layerObj.on("click", (e: LType.LeafletMouseEvent) => {
          logDebug(`marker click ${n.id}`);
          L.DomEvent.stopPropagation(e);
          const screenPoint = screenPointFor(e.latlng);
          if (!screenPoint) return;
          onMarkerClickRef.current(n.id, screenPoint.x, screenPoint.y);
        });
        layerObj.addTo(layer);
      });
    });
  }, [notes, mapReady]);

  // Live preview of the in-progress shape while drawing — a dashed outline
  // that grows with each vertex, redrawn (not just updated) on every point
  // since Leaflet's setLatLngs needs at least 2 points and drawPoints
  // starts empty.
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    import("leaflet").then((L) => {
      drawPreviewLayerRef.current?.remove();
      drawPreviewLayerRef.current = undefined;
      if (drawPoints.length < 2) return;
      // Close the loop visually once there's enough points to be a real
      // shape, so the preview matches what Finish Shape will actually save.
      const path = drawPoints.length >= 3 ? [...drawPoints, drawPoints[0]] : drawPoints;
      drawPreviewLayerRef.current = L.polyline(path, {
        color: "#16a34a",
        weight: 2,
        dashArray: "6,6",
      }).addTo(map);
    });
  }, [drawPoints, mapReady]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className={`w-full h-full rounded-[10px] ${canAdd || drawMode ? "cursor-crosshair" : ""}`} />
      {drawMode && (
        <div className="absolute top-2.5 left-1/2 -translate-x-1/2 z-[1500] bg-white border-[1.5px] border-rule rounded-lg shadow-lg px-3 py-2 flex items-center gap-3 text-xs">
          <span className="text-ink font-medium">
            {drawPoints.length === 0
              ? "Click the map to start tracing a zone"
              : `${drawPoints.length} point${drawPoints.length === 1 ? "" : "s"}${drawPoints.length < 3 ? " — need at least 3" : ""}`}
          </span>
          <button
            type="button"
            disabled={drawPoints.length < 3}
            onClick={finishShape}
            className="px-2.5 py-1 bg-green-mid text-white font-semibold rounded hover:bg-green-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Finish Shape
          </button>
          <button type="button" onClick={cancelDrawing} className="text-mist font-semibold hover:text-ink">
            Cancel
          </button>
        </div>
      )}
      {debug && (
        <div className="absolute inset-x-0 bottom-0 z-[2000] max-h-[45%] overflow-y-auto bg-black/85 text-white text-[10px] font-mono p-2 leading-tight">
          <div className="text-green-300 mb-1">
            UA: {typeof navigator !== "undefined" ? navigator.userAgent : ""}
          </div>
          {debugLog.length === 0 && <div>waiting for events…</div>}
          {debugLog.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}
    </div>
  );
}
