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
  onMapClick,
  onMarkerClick,
}: {
  center: { lat: number; lng: number };
  notes: CourseMapNote[];
  canAdd: boolean;
  onMapClick?: (lat: number, lng: number, clientX: number, clientY: number) => void;
  onMarkerClick: (noteId: string, clientX: number, clientY: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LType.Map | undefined>(undefined);
  const markersLayerRef = useRef<LType.LayerGroup | undefined>(undefined);
  const onMapClickRef = useRef(onMapClick);
  const onMarkerClickRef = useRef(onMarkerClick);
  const canAddRef = useRef(canAdd);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    onMapClickRef.current = onMapClick;
    onMarkerClickRef.current = onMarkerClick;
    canAddRef.current = canAdd;
  }, [onMapClick, onMarkerClick, canAdd]);

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

      const map = L.map(containerRef.current, { center: [center.lat, center.lng], zoom: 17 });
      mapRef.current = map;

      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { attribution: "Tiles &copy; Esri", maxZoom: 20 }
      ).addTo(map);

      markersLayerRef.current = L.layerGroup().addTo(map);

      map.on("click", (e: LType.LeafletMouseEvent) => {
        if (!canAddRef.current || !onMapClickRef.current) return;
        const screenPoint = screenPointFor(e.latlng);
        if (!screenPoint) return;
        onMapClickRef.current(e.latlng.lat, e.latlng.lng, screenPoint.x, screenPoint.y);
      });

      setMapReady(true);
    });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = undefined;
      markersLayerRef.current = undefined;
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
        const marker = L.marker([n.lat, n.lng], { icon: createDotIcon(L, categoryColor(n.category)) });
        marker.on("click", (e: LType.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
          const screenPoint = screenPointFor(e.latlng);
          if (!screenPoint) return;
          onMarkerClickRef.current(n.id, screenPoint.x, screenPoint.y);
        });
        marker.addTo(layer);
      });
    });
  }, [notes, mapReady]);

  return <div ref={containerRef} className={`w-full h-full rounded-[10px] ${canAdd ? "cursor-crosshair" : ""}`} />;
}
