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

  useEffect(() => {
    let cancelled = false;
    let map: LType.Map | undefined;

    import("leaflet").then((L) => {
      if (cancelled || !containerRef.current) return;

      map = L.map(containerRef.current, { center: [center.lat, center.lng], zoom: 17 });

      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { attribution: "Tiles &copy; Esri", maxZoom: 20 }
      ).addTo(map);

      markersLayerRef.current = L.layerGroup().addTo(map);

      map.on("click", (e: LType.LeafletMouseEvent) => {
        if (!canAddRef.current || !onMapClickRef.current) return;
        onMapClickRef.current(e.latlng.lat, e.latlng.lng, e.originalEvent.clientX, e.originalEvent.clientY);
      });

      setMapReady(true);
    });

    return () => {
      cancelled = true;
      map?.remove();
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
          onMarkerClickRef.current(n.id, e.originalEvent.clientX, e.originalEvent.clientY);
        });
        marker.addTo(layer);
      });
    });
  }, [notes, mapReady]);

  return <div ref={containerRef} className={`w-full h-full rounded-[10px] ${canAdd ? "cursor-crosshair" : ""}`} />;
}
