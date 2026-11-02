import type { Metadata } from "next";
import Link from "next/link";
import { CheckoutButton } from "@/components/CheckoutButton";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { CheckIcon, Section } from "@/components/ui";
import { getEntitlements } from "@/lib/plans";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "Pricing" };

const TIERS = [
  { key: "free", name: "Free", price: "$0", cadence: "",
    features: ["1 scan per month", "Score and verdict", "Problem titles"] },
  { key: "repo", name: "Repo Pass", price: "$29", cadence: "one-time", highlight: true,
    features: ["Full report for one repo", "Fix prompts", "5 rescans", "Share link"] },
  { key: "pro", name: "Pro", price: "$49", cadence: "/ month",
    features: ["Unlimited scans", "Full reports and fix prompts", "Pull request checks", "Production Ready badge"] },
] as const;

export default async function Pricing() {
  const user = await getCurrentUser().catch(() => null);
  const ent = user ? await getEntitlements(user.id).catch(() => null) : null;

  return (
    <div>
      <Reveal onMount className="mx-auto max-w-3xl px-5 pt-20 pb-14 text-center">
        <h1 className="display text-[40px] sm:text-[56px]">Start free. <span className="text-ink-4">Pay for the fixes.</span></h1>
      </Reveal>

      <Section><Stagger onMount delay={0.15} gap={0.08} className="grid gap-px bg-line lg:grid-cols-3">
        {TIERS.map((t) => (
          <StaggerItem key={t.key} className={`relative flex flex-col bg-canvas p-7 sm:p-8 ${"highlight" in t ? "bg-panel" : ""}`}>
            <p className="text-[15px] font-semibold text-ink">{t.name}</p>
            <p className="mt-6 flex items-baseline gap-2"><span className="text-5xl font-semibold tracking-tight text-ink">{t.price}</span><span className="text-sm text-ink-4">{t.cadence}</span></p>
            <ul className="mt-8 flex-1 space-y-3 text-[14px] text-ink-2">
              {t.features.map((f) => <li key={f} className="flex gap-2.5"><CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" />{f}</li>)}
            </ul>
            <div className="mt-10">
              {t.key === "free" && <Link href="/#scan" className="btn-ghost w-full">Start a free scan</Link>}
              {t.key === "repo" && (user
                ? <Link href="/dashboard" className="btn-accent w-full">Pick a scanned repo</Link>
                : <a href="/api/auth/github?next=/" className="btn-accent w-full">Scan first, then unlock</a>)}
              {t.key === "pro" && (ent?.pro
                ? <form action="/api/billing/portal" method="post"><button className="btn-ghost w-full">Manage subscription</button></form>
                : <CheckoutButton plan="pro" signedIn={!!user} className="btn-white">Go Pro</CheckoutButton>)}
            </div>
          </StaggerItem>
        ))}
      </Stagger></Section>
    </div>
  );
}
