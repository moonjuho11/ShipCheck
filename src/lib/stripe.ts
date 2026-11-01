import Stripe from "stripe";
import { sql } from "./db";
import { env } from "./env";
import type { UserRow } from "./types";

let client: Stripe | null = null;
export function stripe(): Stripe {
  if (!client) client = new Stripe(env.stripeSecretKey);
  return client;
}

export async function ensureCustomer(user: UserRow): Promise<string> {
  if (user.stripe_customer_id) return user.stripe_customer_id;
  const c = await stripe().customers.create({ email: user.email ?? undefined, name: user.name ?? user.github_login, metadata: { userId: user.id, github: user.github_login } });
  await sql()`update users set stripe_customer_id = ${c.id} where id = ${user.id} and stripe_customer_id is null`;
  const [u] = await sql()<{ stripe_customer_id: string }[]>`select stripe_customer_id from users where id = ${user.id}`;
  return u.stripe_customer_id;
}

/** Idempotent: safe to call from both the webhook and the success redirect. */
export async function fulfillCheckoutSession(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId || session.client_reference_id;
  if (!userId) return;
  if (session.mode === "payment") {
    if (session.payment_status !== "paid") return;
    const repo = session.metadata?.repo;
    if (!repo) return;
    await sql()`
      insert into repo_unlocks (user_id, repo_full_name, stripe_checkout_session_id, amount_cents)
      values (${userId}, ${repo}, ${session.id}, ${session.amount_total ?? null})
      on conflict do nothing`;
  } else if (session.mode === "subscription" && session.subscription) {
    const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
    await syncSubscription(await stripe().subscriptions.retrieve(subId), userId);
  }
}

export async function syncSubscription(sub: Stripe.Subscription, userIdHint?: string) {
  let userId = userIdHint || sub.metadata?.userId;
  if (!userId) {
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    const [u] = await sql()<{ id: string }[]>`select id from users where stripe_customer_id = ${customerId}`;
    userId = u?.id;
  }
  if (!userId) return;
  // current_period_end moved onto subscription items in newer API versions.
  const periodEnd = (sub as unknown as { current_period_end?: number }).current_period_end ?? sub.items?.data?.[0]?.current_period_end;
  await sql()`
    insert into subscriptions (user_id, stripe_subscription_id, status, current_period_end)
    values (${userId}, ${sub.id}, ${sub.status}, ${periodEnd ? new Date(periodEnd * 1000) : null})
    on conflict (stripe_subscription_id) do update
      set status = excluded.status, current_period_end = excluded.current_period_end, updated_at = now()`;
}
