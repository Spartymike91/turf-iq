// task_templates.estimated_duration is free text ("3 hr", "8 hr", "45 min")
// rather than a structured number — this reads the leading number and an
// optional unit, defaulting to minutes when no unit is given (matching the
// template form's own "45 min" placeholder). A bare `parseInt` on "3 hr"
// would read 3 as minutes instead of 180 — this is the fix for that.
export function parseEstimatedMinutes(text: string | null | undefined): number | null {
  if (!text) return null;
  const match = text.trim().match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]*)/);
  if (!match) return null;
  const value = parseFloat(match[1]);
  if (Number.isNaN(value)) return null;
  const unit = match[2].toLowerCase();
  return Math.round(unit.startsWith("h") ? value * 60 : value);
}

// Single source of truth for "how long did this task actually take" —
// an owner/superintendent/assistant's manual override always wins (see
// task_assignments.actual_minutes_override in supabase-schema.sql), since
// it exists specifically to correct a bad computed value (forgotten
// Complete click, etc.). Falls back to the raw timestamp math only when
// no override is set, and returns null when there's not enough data to
// compute anything (task never actually started/completed).
export function actualMinutesFor(assignment: {
  actual_minutes_override?: number | null;
  started_at: string | null;
  completed_at: string | null;
  paused_minutes: number | null;
}): number | null {
  if (assignment.actual_minutes_override != null) return Number(assignment.actual_minutes_override);
  if (!assignment.started_at || !assignment.completed_at) return null;
  return Math.max(
    0,
    (new Date(assignment.completed_at).getTime() - new Date(assignment.started_at).getTime()) / 60000 -
      Number(assignment.paused_minutes ?? 0)
  );
}

export function formatMinutes(minutes: number): string {
  const rounded = Math.round(minutes);
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;
  if (hours <= 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}
