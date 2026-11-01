import type { Metadata } from "next";
import Link from "next/link";
import { CheckoutButton } from "@/components/CheckoutButton";
import { getEntitlements } from "@/lib/plans";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "Pricing" };

const TIERS = [
  {
    key: "free", name: "Free", price: "$0", cadence: "", tagline: "See what's wrong",
    features: ["1 scan per month", "Your safety score and Production Ready check", "Every problem's title and how serious it is"],
  },
  {
    key: "repo", name: "Repo Pass", price: "$29", cadence: "one-time", tagline: "Fix one app before launch", highlight: true,
    features: ["Full report for one repo", "Plain-English explanation of every problem", "Copy-paste fix prompts for your AI agent", "5 rescans to confirm your fixes", "Shareable report link"],
  },
  {
    key: "pro", name: "Pro", price: "$49", cadence: "/month", tagline: "Stay safe while you keep shipping",
    features: ["Unlimited scans and rescans, any repo", "Full reports with fix prompts", "Automatic check on every GitHub pull request", "Embeddable “Production Ready” badge", "Cancel anytime"],
  },
] as const;

export default async function Pricing() {
  const user = await getCurrentUser().catch(() => null);
  const ent = user ? await getEntitlements(user.id).catch(() => null) : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900">Simple pricing</h1>
        <p className="mt-3 text-lg text-slate-600">Start free. Pay only when you want the fixes.</p>
      </div>
      <div className="mt-12 grid gap-6 lg:grid-cols-3">
        {TIERS.map((t) => (
          <div key={t.key} className={`card relative flex flex-col p-6 ${"highlight" in t && t.highlight ? "ring-2 ring-brand-500" : ""}`}>
            {"highlight" in t && t.highlight && <span className="absolute -top-3 left-6 rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold text-white">Most popular before launch</span>}
            <h2 className="text-lg font-semibold text-slate-900">{t.name}</h2>
            <p className="text-sm text-slate-500">{t.tagline}</p>
            <p className="mt-4"><span className="text-4xl font-bold text-slate-900">{t.price}</span> <span className="text-slate-500">{t.cadence}</span></p>
            <ul className="mt-6 flex-1 space-y-2.5 text-sm text-slate-700">
              {t.features.map((f) => <li key={f} className="flex gap-2"><span className="text-brand-600">✓</span>{f}</li>)}
            </ul>
            <div className="mt-8">
              {t.key === "free" && <Link href="/" className="btn-ghost w-full">Start a free scan</Link>}
              {t.key === "repo" && (
                user ? <Link href="/dashboard" className="btn-brand w-full">Pick a scanned repo to unlock</Link>
                  : <a href="/api/auth/github?next=/" className="btn-brand w-full">Scan first, then unlock</a>
              )}
              {t.key === "pro" && (ent?.pro
                ? <form action="/api/billing/portal" method="post"><button className="btn-ghost w-full">Manage subscription</button></form>
                : <CheckoutButton plan="pro" signedIn={!!user} className="btn-primary">Go Pro</CheckoutButton>)}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-10 text-center text-sm text-slate-500">Payments are handled securely by Stripe. Prices in USD.</p>
    </div>
  );
}
