function report(message: string, stack?: string, context?: Record<string, unknown>) {
  try {
    const payload = JSON.stringify({ message, stack, url: window.location.href, context });
    const sent = navigator.sendBeacon?.(
      "/api/errors",
      new Blob([payload], { type: "application/json" })
    );
    if (!sent) {
      fetch("/api/errors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // Reporting must never itself throw.
  }
}

window.addEventListener("error", (event) => {
  report(event.message || "Unknown client error", event.error?.stack, {
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
  });
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  const message =
    reason instanceof Error ? reason.message : String(reason ?? "Unhandled promise rejection");
  report(message, reason instanceof Error ? reason.stack : undefined, { kind: "unhandledrejection" });
});
