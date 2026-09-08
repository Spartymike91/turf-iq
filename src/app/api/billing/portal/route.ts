import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCourseIdServer } from "@/lib/supabase/course-context.server";
import { getStripe } from "@/lib/stripe";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Same reasoning as billing/checkout: always the caller's actual "current
  // course," never an arbitrary one, and never available during admin view.
  const context = await resolveCourseIdServer(supabase, user);
  if (!context) return NextResponse.json({ error: "No course found for this account." }, { status: 404 });
  if (context.isAdminView) {
    return NextResponse.json({ error: "Billing isn't available while viewing as another course." }, { status: 403 });
  }
  const courseId = context.courseId;

  const { data: membership } = await supabase
    .from("course_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("course_id", courseId)
    .single();
  if (!membership) return NextResponse.json({ error: "No course found for this account." }, { status: 404 });
  if (membership.role !== "owner") {
    return NextResponse.json({ error: "Only the course owner can manage billing." }, { status: 403 });
  }

  const { data: course } = await supabase
    .from("courses")
    .select("stripe_customer_id")
    .eq("id", courseId)
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
