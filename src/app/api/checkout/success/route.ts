import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getSessionUserId, safeNext } from "@/lib/session";
import { fulfillCheckoutSession, stripe } from "@/lib/stripe";

// Stripe redirects here after payment. We fulfil immediately (idempotent) so the
// user doesn't have to wait for the webhook; the webhook remains the source of truth.
export async function GET(req: NextRequest) {
  const next = safeNext(req.nextUrl.searchParams.get("next"));
  const id = req.nextUrl.searchParams.get("session_id");
  const userId = await getSessionUserId();
  if (id && userId && /^cs_[A-Za-z0-9_]+$/.test(id)) {
    try {
      const session = await stripe().checkout.sessions.retrieve(id);
      if ((session.metadata?.userId || session.client_reference_id) === userId) await fulfillCheckoutSession(session);
    } catch (e) {
      console.error("checkout success fulfilment failed", (e as Error).message);
    }
  }
  const url = new URL(`${env.appUrl}${next}`);
  url.searchParams.set("paid", "1");
  return NextResponse.redirect(url);
}
