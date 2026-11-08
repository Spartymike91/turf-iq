"use client";

import { MOW_DIRECTIONS } from "@/lib/mowDirections";
import { CLEANUP_LAP_DIRECTIONS } from "@/lib/cleanupLapDirections";

export interface CrewTask {
  id: string;
  name: string;
  icon?: string | null;
  status: string;
  assigned_to: string | null;
  scheduled_date: string;
  notes?: string | null;
  mow_direction?: string | null;
  cleanup_lap_direction?: string | null;
  estimated_minutes?: number | null;
  paused_at?: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  paused: "Paused",
  complete: "Complete",
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-2 border-b border-rule last:border-0">
      <div className="w-28 shrink-0 text-[11px] font-mono uppercase tracking-wide text-mist pt-0.5">{label}</div>
      <div className="flex-1 text-sm text-ink">{children}</div>
    </div>
  );
}

// Everything about one task in one place, with the same Start / Pause /
// Resume / Finish actions as the list so the crew never has to leave it.
export default function TaskDetailModal({
  task,
  assigneeName,
  canAct,
  onClose,
  onAction,
  onFinish,
}: {
  task: CrewTask;
  assigneeName: string;
  canAct: boolean;
  onClose: () => void;
  onAction: (action: "start" | "pause" | "resume") => void;
  onFinish: () => void;
}) {
  const mow = MOW_DIRECTIONS.find((d) => d.value === task.mow_direction);
  const lap = CLEANUP_LAP_DIRECTIONS.find((d) => d.value === task.cleanup_lap_direction);
  const date = new Date(`${task.scheduled_date}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const btn = "flex-1 px-4 py-3 text-sm font-semibold rounded-lg transition-colors";

  return (
    <div className="fixed inset-0 bg-black/35 z-[200] flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-[10px] p-6 max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="font-serif text-xl text-green-dark">
            {task.icon ? `${task.icon} ` : ""}
            {task.name}
          </div>
          <button onClick={onClose} aria-label="Close" className="text-mist text-xl leading-none">
            ×
          </button>
        </div>

        <div className="mb-4">
          <Row label="Status">{STATUS_LABEL[task.status] ?? task.status}</Row>
          <Row label="Assigned to">{assigneeName}</Row>
          <Row label="Date">{date}</Row>
          {task.estimated_minutes ? <Row label="Estimated">{task.estimated_minutes} min</Row> : null}
          {mow && <Row label="Mow direction">{mow.label}</Row>}
          {lap && <Row label="Cleanup lap">{lap.label}</Row>}
          <Row label="Notes">{task.notes ? <span className="whitespace-pre-wrap">{task.notes}</span> : <span className="text-mist">None</span>}</Row>
        </div>

        {canAct && task.status !== "complete" && (
          <div className="flex gap-2">
            {task.status === "not_started" && (
              <button onClick={() => onAction("start")} className={`${btn} bg-green-mid text-white hover:bg-green-dark`}>
                Start
              </button>
            )}
            {task.status === "in_progress" && (
              <>
                <button onClick={() => onAction("pause")} className={`${btn} border-[1.5px] border-rule text-amber-800`}>
                  ⏸ Pause
                </button>
                <button onClick={onFinish} className={`${btn} bg-green-mid text-white hover:bg-green-dark`}>
                  Finish
                </button>
              </>
            )}
            {task.status === "paused" && (
              <>
                <button onClick={() => onAction("resume")} className={`${btn} bg-green-mid text-white hover:bg-green-dark`}>
                  ▶ Resume
                </button>
                <button onClick={onFinish} className={`${btn} border-[1.5px] border-rule text-ink`}>
                  Finish
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
