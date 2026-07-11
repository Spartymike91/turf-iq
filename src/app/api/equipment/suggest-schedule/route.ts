import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const SYSTEM_PROMPT = `You suggest TYPICAL maintenance schedules for golf course turf equipment (mowers, utility vehicles, aerators, sprayers, etc.).

You are NOT looking up an authoritative manufacturer document — you don't have access to one. Give your best general knowledge of maintenance intervals typical for this type/make/model of equipment. Be conservative and realistic; if you're not confident about model-specific details, give sensible generic intervals for that equipment category instead of inventing false precision.

Respond with ONLY a JSON array (no prose, no markdown fences) of objects shaped exactly like:
[{ "task": string, "interval_hours": number | null, "interval_days": number | null, "notes": string }]

Include 4-8 common maintenance tasks (e.g. engine oil/filter change, hydraulic fluid/filter, air filter, reel/blade sharpening or bedknife adjustment, spark plugs, grease fittings, belt inspection). Use interval_hours for usage-based tasks and/or interval_days for calendar-based tasks — set the other to null if not applicable. Keep "notes" short (under 15 words).`;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { make, model, name } = await request.json();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI suggestions aren't configured yet. Add ANTHROPIC_API_KEY to your environment variables." },
      { status: 200 }
    );
  }

  if (!make && !model && !name) {
    return NextResponse.json({ error: "Enter at least an equipment name, make, or model first." }, { status: 400 });
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
        messages: [
          {
            role: "user",
            content: `Equipment: ${name || "—"}\nMake: ${make || "—"}\nModel: ${model || "—"}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Anthropic API error:", err);
      return NextResponse.json({ error: "AI suggestion request failed. Try again." }, { status: 200 });
    }

    const data = await res.json();
    const text = data.content[0].text.trim();

    let items;
    try {
      items = JSON.parse(text);
    } catch {
      const match = text.match(/\[[\s\S]*\]/);
      items = match ? JSON.parse(match[0]) : null;
    }

    if (!Array.isArray(items)) {
      return NextResponse.json({ error: "AI response wasn't in the expected format. Try again." }, { status: 200 });
    }

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Suggest-schedule error:", error);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 200 });
  }
}
