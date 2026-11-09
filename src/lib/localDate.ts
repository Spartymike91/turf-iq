// Today's date (YYYY-MM-DD) in the viewer's own time zone. The task pages used
// `new Date().toISOString().slice(0, 10)`, which is the UTC date — so every
// evening after ~7 PM Eastern the scheduler and crew board jumped to
// "tomorrow" and tasks assigned for today vanished from the crew's view.
export function localDateStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
