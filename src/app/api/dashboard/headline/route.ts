import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCourseIdServer } from "@/lib/supabase/course-context.server";
import { fetchDashboardData, buildPromptSections } from "@/lib/dashboardBriefing";

const SYSTEM_PROMPT = `You are the Turf IQ AI Agronomist, writing a short "Daily Focus" briefing for a golf course superintendent, based ONLY on the data provided below. Do not invent facts or figures. Do not recommend specific fungicide/pesticide/herbicide products or rates — defer to the superintendent's own rotation/compliance program.

Respond with ONLY a JSON object (no prose, no markdown fences) shaped exactly:
{ "headline": string, "focusItems": string[] }

"headline": one sentence (under 30 words), the single most important thing to focus on today, grounded in the data below.
"focusItems": 2-4 short bullets (under 15 words each), concrete and actionable. Where a scheduled task below is directly relevant, reference it by its actual name rather than inventing a new one. A task already marked "complete" is done — never instruct the user to complete, do, or start it; if worth mentioning at all, only note it in passing (e.g. as context already handled), and prefer bullets about what's still open.`;

// The slow path, split out from /api/dashboard/briefing so the dashboard can
// render real data immediately and let this resolve in the background — see
// that route's comment for why. Re-resolves the same course data itself
// (rather than trusting a client-submitted copy) since it's cheap — see
// fetchDashboardData's docstring on why calling it twice is fine.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const context = await resolveCourseIdServer(supabase, user);
  if (!context) {
    return NextResponse.json({ error: "No course found for this user." }, { status: 404 });
  }
  const courseId = context.courseId;

  const { data: course } = await supabase
    .from("courses")
    .select("name, city, state, grass_type, latitude, longitude")
    .eq("id", courseId)
    .single();

  if (!course) {
    return NextResponse.json({ error: "Course not found." }, { status: 404 });
  }

  const dashboardData = await fetchDashboardData(supabase, courseId, course);
  const promptSections = buildPromptSections(course, dashboardData);

  let headline: string | null = null;
  let focusItems: string[] = [];

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 400,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: promptSections.join("\n") }],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const text = data.content[0].text.trim();
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch {
          const match = text.match(/\{[\s\S]*\}/);
          parsed = match ? JSON.parse(match[0]) : null;
        }
        if (parsed && typeof parsed.headline === "string" && Array.isArray(parsed.focusItems)) {
          headline = parsed.headline;
          focusItems = parsed.focusItems.filter((f: unknown) => typeof f === "string");
        }
      } else {
        console.error("Headline Anthropic API error:", await res.text());
      }
    } catch (error) {
      console.error("Headline generation error:", error);
    }
  }

  return NextResponse.json({ headline, focusItems, generatedAt: new Date().toISOString() });
}
