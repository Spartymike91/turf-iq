import Stripe from "stripe";

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe {
  if (stripeClient) return stripeClient;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Add it to .env.local (Stripe Dashboard → Developers → API keys, test mode)."
    );
  }
  stripeClient = new Stripe(key);
  return stripeClient;
}
