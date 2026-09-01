import type { PlanTier } from "@/lib/billing";

export const TIER_RANK: Record<PlanTier, number> = {
  agronomist: 1,
  superintendent: 2,
  complete: 3,
};

// Route prefix -> minimum tier required. Anything not listed here (dashboard,
// weather, turf-health, course, admin, ...) is unrestricted on every tier.
const ROUTE_TIER: { prefix: string; requiredTier: PlanTier }[] = [
  { prefix: "/irrigation", requiredTier: "superintendent" },
  { prefix: "/equipment", requiredTier: "superintendent" },
  { prefix: "/budget", requiredTier: "superintendent" },
  { prefix: "/inventory", requiredTier: "superintendent" },
  { prefix: "/labor", requiredTier: "complete" },
  { prefix: "/tasks", requiredTier: "complete" },
  { prefix: "/team", requiredTier: "complete" },
];

export function getRequiredTier(pathname: string): PlanTier | null {
  const match = ROUTE_TIER.find((r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`));
  return match ? match.requiredTier : null;
}

export const MODULE_LABEL: Record<string, { icon: string; label: string }> = {
  "/irrigation": { icon: "💧", label: "Irrigation Management" },
  "/equipment": { icon: "🔧", label: "Equipment Management" },
  "/budget": { icon: "📊", label: "Budget & Reporting" },
  "/inventory": { icon: "📦", label: "Product Inventory" },
  "/labor": { icon: "👷", label: "Labor & Staffing" },
  "/tasks": { icon: "📋", label: "Task Management" },
  "/team": { icon: "👥", label: "Team & Roles" },
};

export function getModuleLabel(pathname: string): { icon: string; label: string } | null {
  const match = ROUTE_TIER.find((r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`));
  return match ? MODULE_LABEL[match.prefix] : null;
}

// A course with no plan_tier on file (test/demo courses created outside the
// Stripe checkout flow, or ones set up before billing existed) is treated as
// unrestricted — gating only applies once a course has a real tier, which
// the Stripe webhook sets automatically on checkout.
export function hasModuleAccess(courseTier: PlanTier | null, pathname: string): boolean {
  const required = getRequiredTier(pathname);
  if (!required || !courseTier) return true;
  return TIER_RANK[courseTier] >= TIER_RANK[required];
}

// The full set of restrictable nav tabs. Shared by AppHeader (rendering) and
// the per-crew permission checklist on the Team page (invite + edit access) —
// keeping one canonical list avoids the two drifting apart.
export const ALL_MODULES: { slug: string; href: string; icon: string; label: string }[] = [
  { slug: "weather", href: "/weather", icon: "🌤", label: "Weather" },
  { slug: "turf-health", href: "/turf-health", icon: "🌱", label: "Turf Health" },
  { slug: "irrigation", href: "/irrigation", icon: "💧", label: "Irrigation" },
  { slug: "equipment", href: "/equipment", icon: "🔧", label: "Equipment" },
  { slug: "inventory", href: "/inventory", icon: "📦", label: "Inventory" },
  { slug: "budget", href: "/budget", icon: "📊", label: "Budget" },
  { slug: "labor", href: "/labor", icon: "👷", label: "Labor" },
  { slug: "tasks", href: "/tasks", icon: "📋", label: "Tasks" },
  { slug: "team", href: "/team", icon: "👥", label: "Team" },
];

// null = unrestricted (default for owners/superintendents and any member
// who's never been restricted) — sees everything the plan tier allows.
export function hasModulePermission(allowedModules: string[] | null, pathname: string): boolean {
  if (!allowedModules) return true;
  const found = ALL_MODULES.find((m) => pathname === m.href || pathname.startsWith(`${m.href}/`));
  if (!found) return true; // dashboard, course settings, etc. are never restrictable
  return allowedModules.includes(found.slug);
}
