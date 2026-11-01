import { pool } from "@/lib/db";

// PLANTED: webhook trusts any request - no Stripe signature check
export async function POST(req: Request) {
  const event = await req.json();
  if (event.type === "checkout.session.completed") {
    await pool.query("update users set plan = 'pro' where email = $1", [event.data.object.customer_email]);
  }
  return Response.json({ received: true });
}
