import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCourseIdServer } from "@/lib/supabase/course-context.server";
import { recordError } from "@/lib/errorLog";

// Public ingest endpoint for client-side error reporting (instrumentation-client.ts,
// global-error.tsx). No auth required — errors can happen pre-login (e.g. on /login)
// — but we opportunistically attach the session/course if one exists.
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    message?: string;
    stack?: string;
    url?: string;
    context?: Record<string, unknown>;
  } | null;

  if (!body?.message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const context = user ? await resolveCourseIdServer(supabase, user) : null;

  await recordError({
    source: "client",
    message: body.message,
    stack: body.stack,
    url: body.url,
    userAgent: request.headers.get("user-agent"),
    context: body.context ?? null,
    courseId: context?.courseId ?? null,
    userId: user?.id ?? null,
  });

  return NextResponse.json({ ok: true });
}
