import { redirect } from "next/navigation";

// Fertility, Weed, Insects, and Disease Risk merged into one "Turf Health"
// tab with sub-tabs — this route stays only to preserve old bookmarks/links.
// "Pest & Weed" itself split into separate Weed/Insects tabs, so this old
// combined route defaults to Insects (the closer successor to the old
// catch-all "Pest & Weed" bucket).
export default function PestWeedRedirect() {
  redirect("/turf-health?tab=insects");
}
