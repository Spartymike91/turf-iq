"use client";

import { useState } from "react";

interface TaskAssignment {
  id: string;
  [key: string]: unknown;
}

export default function TaskCompleteModal({
  task,
  onClose,
  onCompleted,
}: {
  task: { id: string; name: string };
  onClose: () => void;
  onCompleted: (updated: TaskAssignment) => void;
}) {
  const [materialsCost, setMaterialsCost] = useState("");
  const [materialsNote, setMaterialsNote] = useState("");
  const [qualityRating, setQualityRating] = useState<number | null>(null);
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCompleting(true);
    setCompleteError(null);
    try {
      const res = await fetch("/api/tasks/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignment_id: task.id,
          materials_cost: materialsCost ? parseFloat(materialsCost) : undefined,
          materials_note: materialsNote || undefined,
          quality_rating: qualityRating ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCompleteError(data.error ?? "Could not complete task.");
      } else {
        onCompleted(data.assignment);
        onClose();
      }
    } catch {
      setCompleteError("Could not complete task.");
    }
    setCompleting(false);
  }

  return (
    <div className="fixed inset-0 bg-black/35 z-[200] flex items-center justify-center p-4">
      <div className="bg-white rounded-[10px] p-6 max-w-sm w-full">
        <div className="font-serif text-lg text-green-dark mb-1">Mark Complete</div>
        <div className="text-sm text-mist mb-4">{task.name}</div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wide">
              Materials Cost <span className="text-mist font-normal normal-case">(optional — e.g. chemical used)</span>
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={materialsCost}
              onChange={(e) => setMaterialsCost(e.target.value)}
              placeholder="0.00"
              className="px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid"
            />
          </div>
          {materialsCost && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide">What was used</label>
              <input
                value={materialsNote}
                onChange={(e) => setMaterialsNote(e.target.value)}
                placeholder="e.g. 2 gal fungicide on #4-9 greens"
                className="px-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid"
              />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wide">
              Quality <span className="text-mist font-normal normal-case">(optional, 1-5)</span>
            </label>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setQualityRating(qualityRating === n ? null : n)}
                  className={`w-9 h-9 rounded-lg text-sm font-semibold border-[1.5px] transition-colors ${
                    qualityRating === n
                      ? "bg-green-mid text-white border-green-mid"
                      : "border-rule text-mist hover:border-green-mid"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          {completeError && <div className="text-xs text-red">{completeError}</div>}
          <div className="flex gap-2 mt-1">
            <button
              type="submit"
              disabled={completing}
              className="flex-1 px-4 py-2.5 bg-green-mid text-white text-sm font-semibold rounded-lg hover:bg-green-dark transition-colors disabled:opacity-50"
            >
              {completing ? "Saving..." : "Mark Complete"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-mist text-sm font-semibold hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
