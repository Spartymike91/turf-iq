import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlanTier } from "@/lib/billing";

async function syncSubscription(subscription: Stripe.Subscription) {
  const admin = createAdminClient();
  const courseId = subscription.metadata?.course_id;
  const tier = subscription.metadata?.tier;

  // Basil API (2025-03-31+): current_period_end moved off Subscription onto
  // each line item, since a subscription can now have items with different
  // billing cycles. Every Turf IQ subscription has exactly one item.
  const item = subscription.items.data[0];
  const currentPeriodEnd = item?.current_period_end
    ? new Date(item.current_period_end * 1000).toISOString()
    : null;
  const trialEnd = subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null;
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

  const update = {
    stripe_subscription_id: subscription.id,
    stripe_customer_id: customerId,
    subscription_status: subscription.status,
    trial_end: trialEnd,
    current_period_end: currentPeriodEnd,
    ...(isPlanTier(tier) ? { plan_tier: tier } : {}),
  };

  if (courseId) {
    await admin.from("courses").update(update).eq("id", courseId);
  } else {
    await admin.from("courses").update(update).eq("stripe_subscription_id", subscription.id);
  }
}

export async function POST(request: NextRequest) {
  const stripe = getStripe();
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "Webhook not configured." }, { status: 400 });
  }

  // Read the raw body as text BEFORE anything else touches it — signature
  // verification needs the exact bytes Stripe signed.
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  const admin = createAdminClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== "subscription" || !session.subscription) break;
        const subscriptionId =
          typeof session.subscription === "string" ? session.subscription : session.subscription.id;
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        await syncSubscription(subscription);
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        await syncSubscription(event.data.object as Stripe.Subscription);
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const courseId = subscription.metadata?.course_id;
        if (courseId) {
          await admin.from("courses").update({ subscription_status: "canceled" }).eq("id", courseId);
        } else {
          await admin
            .from("courses")
            .update({ subscription_status: "canceled" })
            .eq("stripe_subscription_id", subscription.id);
        }
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        // Basil API: Invoice.subscription moved under
        // parent.subscription_details.subscription.
        const subRef = invoice.parent?.subscription_details?.subscription;
        const subscriptionId = typeof subRef === "string" ? subRef : subRef?.id;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;

        if (subscriptionId) {
          await admin
            .from("courses")
            .update({ subscription_status: "past_due" })
            .eq("stripe_subscription_id", subscriptionId);
        } else if (customerId) {
          await admin.from("courses").update({ subscription_status: "past_due" }).eq("stripe_customer_id", customerId);
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error(`Error handling Stripe webhook event ${event.type}:`, err);
    return NextResponse.json({ error: "Webhook handler error." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
