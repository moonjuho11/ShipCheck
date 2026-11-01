import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { getScan } from "@/lib/scans";
import { getCurrentUser, isSameOrigin } from "@/lib/session";
import { ensureCustomer, stripe } from "@/lib/stripe";

const Body = z.object({ plan: z.enum(["repo", "pro"]), scanId: z.string().uuid().optional() });

// POST /api/checkout { plan: "repo" | "pro", scanId? } → { url } (Stripe Checkout)
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please sign in first.", code: "login_required" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { plan, scanId } = parsed.data;

  let repo: string | undefined;
  let back = "/dashboard";
  if (scanId) {
    const scan = await getScan(scanId);
    if (!scan || scan.user_id !== user.id) return NextResponse.json({ error: "Scan not found" }, { status: 404 });
    repo = scan.repo_full_name;
    back = `/scans/${scan.id}`;
  }
  if (plan === "repo" && !repo) return NextResponse.json({ error: "Run a free scan first, then unlock that repo's full report." }, { status: 400 });

  const customer = await ensureCustomer(user);
  const metadata = { userId: user.id, plan, ...(repo ? { repo } : {}) };
  const session = await stripe().checkout.sessions.create({
    customer,
    client_reference_id: user.id,
    mode: plan === "pro" ? "subscription" : "payment",
    line_items: [{ price: plan === "pro" ? env.stripePricePro : env.stripePriceRepo, quantity: 1 }],
    metadata,
    ...(plan === "pro" ? { subscription_data: { metadata } } : { payment_intent_data: { metadata } }),
    allow_promotion_codes: true,
    success_url: `${env.appUrl}/api/checkout/success?session_id={CHECKOUT_SESSION_ID}&next=${encodeURIComponent(back)}`,
    cancel_url: `${env.appUrl}${back}`,
  });
  return NextResponse.json({ url: session.url });
}
