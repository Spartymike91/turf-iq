import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (err, request) => {
  // Dynamic import: this file runs in the edge runtime too, and errorLog.ts
  // pulls in @supabase/supabase-js, which isn't edge-safe to import at the
  // top level of an instrumentation file that always loads.
  const { recordError } = await import("@/lib/errorLog");
  const isError = err instanceof Error;
  await recordError({
    source: "server",
    message: isError ? err.message : String(err),
    stack: isError ? err.stack : undefined,
    url: request.path,
    context: { method: request.method, digest: (err as { digest?: string })?.digest },
  });
};
