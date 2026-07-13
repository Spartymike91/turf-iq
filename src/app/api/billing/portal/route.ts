import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  const { data: course } = await supabase
    .from("courses")
    .select("stripe_customer_id")
    .eq("id", membership.course_id)
    .single();
  if (!course?.stripe_customer_id) {
    return NextResponse.json({ error: "This course doesn't have billing set up yet." }, { status: 404 });
  }

  const stripe = getStripe();
  const origin = request.headers.get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";

  const session = await stripe.billingPortal.sessions.create({
    customer: course.stripe_customer_id,
    return_url: `${origin}/course`,
  });

  return NextResponse.json({ url: session.url });
}
