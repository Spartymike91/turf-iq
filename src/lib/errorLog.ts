import { createAdminClient } from "@/lib/supabase/admin";

function truncate(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  return value.length > max ? value.slice(0, max) + "…" : value;
}

export async function recordError(entry: {
  source: "client" | "server";
  message: string;
  stack?: string | null;
  url?: string | null;
  userAgent?: string | null;
  context?: Record<string, unknown> | null;
  courseId?: string | null;
  userId?: string | null;
}) {
  try {
    const adminClient = createAdminClient();
    await adminClient.from("error_log").insert({
      source: entry.source,
      message: truncate(entry.message, 2000) ?? "Unknown error",
      stack: truncate(entry.stack, 8000),
      url: truncate(entry.url, 500),
      user_agent: truncate(entry.userAgent, 500),
      context: entry.context ?? null,
      course_id: entry.courseId ?? null,
      user_id: entry.userId ?? null,
    });
  } catch (err) {
    // Error logging must never itself take down the request path.
    console.error("Failed to record error to error_log:", err);
  }
}
