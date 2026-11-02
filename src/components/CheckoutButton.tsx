"use client";
/* eslint-disable @next/next/no-location-assign-relative-destination -- OAuth & Stripe hops need full-page navigations to API routes */

import { useState } from "react";
import { Spinner } from "./ScanForm";

export function CheckoutButton({ plan, scanId, children, className = "btn-accent", signedIn = true }: { plan: "repo" | "pro"; scanId?: string; children: React.ReactNode; className?: string; signedIn?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    if (!signedIn) { window.location.href = `${window.location.origin}/api/auth/github?next=${encodeURIComponent("/pricing")}`; return; }
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan, scanId }) });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.url) { window.location.href = d.url; return; }
      setError(d.error || "Couldn't start checkout.");
    } catch { setError("Couldn't reach the payment page."); }
    setBusy(false);
  }
  return (
    <div>
      <button type="button" onClick={go} disabled={busy} className={`${className} w-full`}>{busy ? <Spinner /> : null}{children}</button>
      {error && <p className="mt-2 text-xs text-crit">{error}</p>}
    </div>
  );
}
