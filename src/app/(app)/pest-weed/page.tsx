import { redirect } from "next/navigation";

// Fertility, Pest & Weed, and Disease Risk merged into one "Turf Health" tab
// with sub-tabs — this route stays only to preserve old bookmarks/links.
export default function PestWeedRedirect() {
  redirect("/turf-health?tab=pest-weed");
}
