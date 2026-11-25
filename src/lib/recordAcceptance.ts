import type { AcceptanceSource } from "./legal";

// Called from the browser once the person has a session. Tries twice, and
// reports failure instead of throwing so callers choose whether to block.
export async function recordAcceptance(source: AcceptanceSource): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch("/api/legal/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source }),
      });
      if (res.ok) return true;
    } catch {
      // fall through to the retry
    }
  }
  console.error("Could not record terms acceptance.");
  return false;
}
