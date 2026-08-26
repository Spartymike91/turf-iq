import type * as LType from "leaflet";

// Leaflet's default marker icon references PNG assets via a relative path
// computed at runtime (L.Icon.Default.imagePath) — that resolution breaks
// under bundlers like Turbopack/webpack, which is why it silently rendered
// as a broken-image placeholder instead of a pin. A self-contained inline
// SVG sidesteps the whole asset-path problem.
export function createPinIcon(L: typeof LType) {
  const svg = `
    <svg width="26" height="38" viewBox="0 0 26 38" xmlns="http://www.w3.org/2000/svg">
      <path d="M13 0C5.82 0 0 5.82 0 13c0 9.75 13 25 13 25s13-15.25 13-25C26 5.82 20.18 0 13 0z" fill="#1a3a2a" stroke="white" stroke-width="1.5"/>
      <circle cx="13" cy="13" r="5" fill="white"/>
    </svg>
  `;
  return L.divIcon({
    html: svg,
    className: "",
    iconSize: [26, 38],
    iconAnchor: [13, 38],
  });
}
