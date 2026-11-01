import type Stripe from "stripe";
import { env } from "@/lib/env";
import { fulfillCheckoutSession, stripe, syncSubscription } from "@/lib/stripe";

export async function POST(req: Request) {
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, req.headers.get("stripe-signature") || "", env.stripeWebhookSecret);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }
  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await fulfillCheckoutSession(event.data.object);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncSubscription(event.data.object);
        break;
    }
  } catch (e) {
    console.error("stripe webhook handling failed", event.type, (e as Error).message);
    return new Response("Handler error", { status: 500 }); // Stripe will retry
  }
  return Response.json({ received: true });
}
