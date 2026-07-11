export const PLAN_TIERS = ["agronomist", "superintendent", "complete"] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

export const PLAN_DISPLAY: Record<PlanTier, { name: string; price: number }> = {
  agronomist: { name: "Agronomist", price: 399 },
  superintendent: { name: "Superintendent", price: 499 },
  complete: { name: "Complete", price: 599 },
};

const TIER_PRICE_ENV: Record<PlanTier, string> = {
  agronomist: "STRIPE_PRICE_AGRONOMIST",
  superintendent: "STRIPE_PRICE_SUPERINTENDENT",
  complete: "STRIPE_PRICE_COMPLETE",
};

export function priceIdForTier(tier: PlanTier): string {
  const envVar = TIER_PRICE_ENV[tier];
  const id = process.env[envVar];
  if (!id) {
    throw new Error(`${envVar} is not set. Add the Stripe test-mode Price ID.`);
  }
  return id;
}

export function isPlanTier(value: string | null | undefined): value is PlanTier {
  return !!value && (PLAN_TIERS as readonly string[]).includes(value);
}

/**
 * The one shared "does this course currently have access" check. Not called
 * anywhere yet — feature gating is out of scope this phase — but exists now
 * so a future gating phase has a single correct place to import from.
 * Waiver takes priority over Stripe state.
 */
export function hasActiveBillingAccess(course: {
  billing_waived_until: string | null;
  subscription_status: string | null;
}): boolean {
  if (course.billing_waived_until && new Date(course.billing_waived_until).getTime() > Date.now()) {
    return true;
  }
  return course.subscription_status === "trialing" || course.subscription_status === "active";
}
