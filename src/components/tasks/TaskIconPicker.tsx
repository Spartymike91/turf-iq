"use client";

import { useEffect, useRef, useState } from "react";
import { TASK_ICON_OPTIONS } from "@/lib/taskIcons";

// Same click-outside/Escape-to-close popup shape already established
// throughout this app (Course Map notes, Calendar's day-color tagger,
// Budget's Reports dropdown, AppHeader's account menu) — a ref, a
// mousedown listener, an Escape listener.
export default function TaskIconPicker({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (icon: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [customValue, setCustomValue] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  function pick(icon: string) {
    onChange(icon);
    setOpen(false);
  }

  return (
    <div className={`relative inline-block ${className ?? ""}`} ref={ref}>
      <button
        type="button"
        onClick={() => {
          // Pre-fill the custom box with whatever's already set if it's
          // not one of the curated options, so re-opening to tweak a
          // one-off emoji doesn't lose it.
          setCustomValue(value && !TASK_ICON_OPTIONS.includes(value) ? value : "");
          setOpen((v) => !v);
        }}
        title="Pick an icon"
        className="w-12 px-2 py-2 border-[1.5px] border-rule rounded-lg text-lg text-center hover:border-green-mid transition-colors"
      >
        {value || "＋"}
      </button>
      {open && (
        <div className="absolute z-[1000] top-full left-0 mt-1 w-64 bg-white border-[1.5px] border-rule rounded-lg shadow-lg p-2.5">
          <div className="grid grid-cols-8 gap-1 max-h-56 overflow-y-auto">
            {TASK_ICON_OPTIONS.map((icon) => (
              <button
                key={icon}
                type="button"
                onClick={() => pick(icon)}
                className={`text-lg rounded py-1 hover:bg-chalk transition-colors ${
                  icon === value ? "bg-green-pale ring-1 ring-green-mid" : ""
                }`}
              >
                {icon}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-rule">
            <input
              type="text"
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
              placeholder="Or type/paste any emoji"
              className="flex-1 min-w-0 px-2 py-1 border-[1.5px] border-rule rounded text-sm outline-none focus:border-green-mid"
            />
            <button
              type="button"
              disabled={!customValue.trim()}
              onClick={() => pick(customValue.trim())}
              className="px-2 py-1 bg-green-mid text-white text-xs font-semibold rounded hover:bg-green-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Use
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
