"use client";

import { useEffect } from "react";

// Catches errors thrown while rendering the root layout itself (rare — most
// errors are caught by nearer error.tsx boundaries). Must render its own
// <html>/<body> since it replaces the root layout when it triggers.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    fetch("/api/errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        url: window.location.href,
        context: { digest: error.digest, boundary: "global-error" },
      }),
      keepalive: true,
    }).catch(() => {});
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen flex items-center justify-center bg-chalk">
        <div className="text-center px-6">
          <div className="font-serif text-2xl text-green-dark mb-2">
            Something went wrong
          </div>
          <p className="text-sm text-mist mb-5 max-w-sm">
            We&apos;ve logged the issue. Try reloading the page — if it keeps happening,
            let us know.
          </p>
          <button
            onClick={reset}
            className="px-4 py-2.5 bg-green-mid text-white text-sm font-semibold rounded-lg hover:bg-green-dark transition-colors"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
