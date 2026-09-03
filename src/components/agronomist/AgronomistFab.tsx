"use client";

import { useEffect, useRef, useState } from "react";

const STORAGE_KEY = "turfiq-agronomist-fab-pos";
const MARGIN = 20; // matches the original bottom-5 right-5 (5 * 4px)
const DRAG_THRESHOLD_PX = 5; // movement past this turns a press into a drag instead of a click

/**
 * Floating "Ask the Agronomist" button — press-and-drag to reposition (e.g.
 * off a form field it's covering), position persists per-browser via
 * localStorage. A real click/tap (no meaningful movement) still opens the
 * panel via onClick, which also covers keyboard activation (Enter/Space) —
 * the pointer handlers below only decide whether to suppress the click
 * event that follows a drag, they never open the panel themselves.
 */
export default function AgronomistFab({ onOpen }: { onOpen: () => void }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const draggingRef = useRef(false);
  const suppressClickRef = useRef(false);
  const startRef = useRef({ pointerX: 0, pointerY: 0, buttonX: 0, buttonY: 0 });

  function clamp(x: number, y: number) {
    const btn = buttonRef.current;
    const w = btn?.offsetWidth ?? 56;
    const h = btn?.offsetHeight ?? 56;
    return {
      x: Math.min(Math.max(x, MARGIN), Math.max(MARGIN, window.innerWidth - w - MARGIN)),
      y: Math.min(Math.max(y, MARGIN), Math.max(MARGIN, window.innerHeight - h - MARGIN)),
    };
  }

  useEffect(() => {
    const btn = buttonRef.current;
    if (!btn) return;

    function recompute() {
      // Guard against a not-yet-laid-out viewport reporting 0 (seen in
      // backgrounded/automated tabs) — computing against that would collapse
      // the button into the corner. Skip and let the CSS fallback hold until
      // a real resize event fires with sane dimensions.
      if (window.innerWidth < 100 || window.innerHeight < 100) return;
      const w = btn!.offsetWidth;
      const h = btn!.offsetHeight;
      let initial = { x: window.innerWidth - w - MARGIN, y: window.innerHeight - h - MARGIN };
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) initial = JSON.parse(saved);
      } catch {
        // localStorage unavailable or corrupt value — fall back silently
      }
      setPos(clamp(initial.x, initial.y));
    }

    recompute();
    window.addEventListener("resize", recompute);
    return () => window.removeEventListener("resize", recompute);
  }, []);

  function handlePointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (!pos) return;
    draggingRef.current = false;
    startRef.current = { pointerX: e.clientX, pointerY: e.clientY, buttonX: pos.x, buttonY: pos.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (!pos || e.buttons === 0) return;
    const dx = e.clientX - startRef.current.pointerX;
    const dy = e.clientY - startRef.current.pointerY;
    if (!draggingRef.current && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
      draggingRef.current = true;
      setIsDragging(true);
    }
    if (draggingRef.current) {
      setPos(clamp(startRef.current.buttonX + dx, startRef.current.buttonY + dy));
    }
  }

  function handlePointerUp(e: React.PointerEvent<HTMLButtonElement>) {
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (draggingRef.current) {
      suppressClickRef.current = true;
      setPos((p) => {
        if (p) {
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
          } catch {
            // best-effort persistence only
          }
        }
        return p;
      });
    }
    draggingRef.current = false;
    setIsDragging(false);
  }

  function handleClick() {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    onOpen();
  }

  // Render unconditionally — `pos` starts null until the mount effect can
  // measure the button's real size via buttonRef, so gating the whole
  // element on `pos` would mean the ref never attaches and pos never gets
  // set. Fall back to the original bottom-5/right-5 corner via className
  // until pos is computed, then switch to explicit left/top pixel coords.
  return (
    <button
      ref={buttonRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClick={handleClick}
      aria-label="Ask the Agronomist"
      style={pos ? { left: pos.x, top: pos.y, touchAction: "none" } : { touchAction: "none" }}
      className={`fixed z-40 flex items-center gap-2 pl-4 pr-4 sm:pr-5 py-3.5 bg-gradient-to-br from-green-mid to-green-forest border border-green-bright/40 rounded-full text-white font-semibold select-none shadow-[0_4px_20px_rgba(45,106,79,0.45)] ${
        pos ? "" : "bottom-5 right-5"
      } ${
        isDragging
          ? "cursor-grabbing"
          : "cursor-grab transition-all hover:from-green-dark hover:to-green-mid hover:shadow-[0_6px_28px_rgba(82,183,136,0.4)] hover:-translate-y-0.5"
      }`}
    >
      <span className="text-xl leading-none">🌿</span>
      <span className="hidden sm:inline text-sm whitespace-nowrap">Ask the Agronomist</span>
      <span className="text-[9px] font-bold bg-green-bright text-green-dark px-1.5 py-0.5 rounded font-mono tracking-wide">
        AI
      </span>
    </button>
  );
}
