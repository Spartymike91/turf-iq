import { NextRequest, NextResponse } from "next/server";

const REPO = "Spartymike91/turf-iq";
const WORKFLOW_FILE = "soil-temp.yml";

// GitHub's own `schedule:` trigger for soil-temp.yml is unreliable in
// practice — confirmed via its Actions run history that entire scheduled
// firings get silently dropped (GitHub's docs acknowledge this happens
// "during periods of high load"), leaving gaps of 8-11+ hours instead of
// the intended 6. Rather than pay for Vercel Pro just to get a dependable
// scheduler (deferred until there are paying customers — remind Mike then),
// a free external cron service (e.g. cron-job.org) hits this route on the
// same 4x/day schedule instead, and this route's only job is to kick the
// existing GitHub Action via workflow_dispatch — the actual Python
// rendering logic is untouched, still runs entirely in GitHub Actions.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const githubToken = process.env.GITHUB_DISPATCH_TOKEN;
  if (!githubToken) {
    return NextResponse.json({ error: "GITHUB_DISPATCH_TOKEN is not configured" }, { status: 500 });
  }

  const res = await fetch(
    `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ ref: "main" }),
    }
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return NextResponse.json({ error: `GitHub dispatch failed (${res.status})`, body }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
