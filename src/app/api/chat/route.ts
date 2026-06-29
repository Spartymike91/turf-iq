import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const SYSTEM_PROMPT = `You are the Turf IQ AI Agronomist — a virtual agronomic advisor for golf course superintendents.

CURRENT COURSE CONTEXT:
- Course: Pebble Creek Golf Club, Atlanta, GA
- 18 holes · 63 maintained acres · Bermudagrass (419 fairways, TifEagle greens)
- Climate: Warm-season humid subtropical (USDA Zone 8a)
- Date: Thursday, June 25, 2026 · 6:42 AM

CURRENT CONDITIONS:
- Temperature: 84°F (High 90°F / Low 72°F)
- Humidity: 71% · Wind: 8 mph SW
- Overnight leaf wetness: 9.2 hours (Dollar Spot threshold: 8+ hrs)
- Today's ET: 0.21" (above 30-day avg of 0.17")
- Soil temp (4"): 78°F
- GDD accumulation: 1,847 (Base 50°F)
- 7-day rainfall: 0.34" · Saturday forecast: 60% chance, 1.2"

DISEASE RISK:
- Dollar Spot: HIGH (Smith-Kerns 0.74) — 18 days since last app, protection window EXPIRED
- Brown Patch: MODERATE (0.48)
- Pythium: LOW (0.18) · Anthracnose: LOW (0.12) · Take-All Patch: WATCH (0.09)

PEST PRESSURE:
- White Grub (Masked Chafer): ACTIVE — egg hatch window at 1,847 GDD
- Large Crabgrass: HIGH — 1-3 tiller stage, post-emergent window open
- Yellow Nutsedge: MODERATE

SOIL MOISTURE:
- Greens: 26% VWC (optimal) · Tees: 24% · Fairways: 22% (marginal)
- Rough: 18% (DRY) · Dry spot alerts: Holes 7, 14 (16-17% VWC)

IRRIGATION:
- Tonight's schedule: 148,200 gal · 2h 3min starting 10 PM
- Monthly water usage: 842K gal of 1.2M budget (70%)

FERTILITY:
- Greens N applied YTD: 2.8 lbs/M (target 6.0 annual)
- Iron (Fe): 42 ppm — DEFICIENT (target 80-120 ppm)
- Next app: Jul 1 spoon-feed 28-0-0 at 0.2 lbs N/M

BUDGET:
- Annual: $680,000 · YTD spent: $312,400 (46%) · On track
- Chemical: 5% over budget · Labor: On budget

GUIDELINES:
- Give specific, actionable recommendations with product names and rates
- Reference the live course data above in your answers
- Be concise but thorough — superintendents are busy professionals
- If recommending a spray, specify timing, rate, and any weather considerations
- Always consider the economic impact of recommendations`;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { messages } = await request.json();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { content: "AI Agronomist is not configured yet. Add ANTHROPIC_API_KEY to your environment variables." },
      { status: 200 }
    );
  }

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
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: messages.map((m: { role: string; content: string }) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Anthropic API error:", err);
      return NextResponse.json(
        { content: "I'm having trouble connecting right now. Please try again." },
        { status: 200 }
      );
    }

    const data = await res.json();
    return NextResponse.json({
      content: data.content[0].text,
    });
  } catch (error) {
    console.error("Chat error:", error);
    return NextResponse.json(
      { content: "Something went wrong. Please try again." },
      { status: 200 }
    );
  }
}
