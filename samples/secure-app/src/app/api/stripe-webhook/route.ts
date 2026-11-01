import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  try {
    const sig = req.headers.get("stripe-signature")!;
    const event = stripe.webhooks.constructEvent(await req.text(), sig, process.env.STRIPE_WEBHOOK_SECRET!);
    console.log("received", event.type);
    return Response.json({ received: true });
  } catch {
    return new Response("Bad signature", { status: 400 });
  }
}
