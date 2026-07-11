import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { priceIdForTier, isPlanTier } from "@/lib/billing";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { tier } = (await request.json()) as { tier?: string };
  if (!isPlanTier(tier)) {
    return NextResponse.json({ error: "A valid plan is required." }, { status: 400 });
  }

  const { data: membership } = await supabase
    .from("course_members")
    .select("course_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .single();
  if (!membership) return NextResponse.json({ error: "No course found for this account." }, { status: 404 });
  if (membership.role !== "owner") {
    return NextResponse.json({ error: "Only the course owner can manage billing." }, { status: 403 });
  }

  const courseId = membership.course_id as string;
  const { data: course } = await supabase
    .from("courses")
    .select("id, name, stripe_customer_id, subscription_status")
    .eq("id", courseId)
    .single();
  if (!course) return NextResponse.json({ error: "Course not found." }, { status: 404 });
  if (course.subscription_status === "active" || course.subscription_status === "trialing") {
    return NextResponse.json({ error: "This course already has billing set up." }, { status: 409 });
  }

  let priceId: string;
  try {
    priceId = priceIdForTier(tier);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Billing is not configured yet. Contact support." }, { status: 500 });
  }

  const stripe = getStripe();
  const adminClient = createAdminClient();

  let customerId = course.stripe_customer_id as string | null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: course.name,
      metadata: { course_id: courseId },
    });
    customerId = customer.id;
    await adminClient.from("courses").update({ stripe_customer_id: customerId }).eq("id", courseId);
  }

  const origin = request.headers.get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: courseId,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      trial_period_days: 14,
      metadata: { course_id: courseId, tier },
    },
    metadata: { course_id: courseId, tier },
    allow_promotion_codes: true,
    success_url: `${origin}/dashboard?checkout=success`,
    cancel_url: `${origin}/course?checkout=cancelled&tier=${tier}`,
  });

  if (!session.url) return NextResponse.json({ error: "Could not create checkout session." }, { status: 500 });
  return NextResponse.json({ url: session.url });
}
