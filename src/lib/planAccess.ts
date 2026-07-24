import type { PlanTier } from "@/lib/billing";

export const TIER_RANK: Record<PlanTier, number> = {
  agronomist: 1,
  superintendent: 2,
  complete: 3,
};

// Route prefix -> minimum tier required. Anything not listed here (dashboard,
// weather, disease, fertility, pest-weed, course, admin, ...) is unrestricted
// on every tier.
const ROUTE_TIER: { prefix: string; requiredTier: PlanTier }[] = [
  { prefix: "/irrigation", requiredTier: "superintendent" },
  { prefix: "/equipment", requiredTier: "superintendent" },
  { prefix: "/budget", requiredTier: "superintendent" },
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
