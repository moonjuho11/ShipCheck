import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getCurrentUser, isSameOrigin } from "@/lib/session";
import { stripe } from "@/lib/stripe";

// POST /api/billing/portal → Stripe customer portal (manage/cancel Pro)
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return new NextResponse("Forbidden", { status: 403 });
  const user = await getCurrentUser();
  if (!user?.stripe_customer_id) return NextResponse.redirect(`${env.appUrl}/pricing`, { status: 303 });
  const portal = await stripe().billingPortal.sessions.create({ customer: user.stripe_customer_id, return_url: `${env.appUrl}/dashboard` });
  return NextResponse.redirect(portal.url, { status: 303 });
}
