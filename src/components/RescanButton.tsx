"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Spinner } from "./ScanForm";

export function RescanButton({ repoUrl, siteUrl, label = "Scan again" }: { repoUrl: string; siteUrl: string | null; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    setBusy(true); setError(null);
    const res = await fetch("/api/scans", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ repoUrl, siteUrl }) });
    const d = await res.json().catch(() => ({}));
    if (res.ok) { router.push(`/scans/${d.id}`); return; }
    setError(d.error || "Couldn't start a new scan.");
    setBusy(false);
  }
  return (
    <div className="flex flex-col items-end">
      <button type="button" onClick={go} disabled={busy} className="btn-ghost !h-9">
        {busy ? <Spinner /> : <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M13.5 8A5.5 5.5 0 1 1 11.9 4.1M13.5 2.5v3h-3" /></svg>}
        {label}
      </button>
      {error && <p className="mt-1.5 max-w-xs text-right text-xs text-crit">{error}</p>}
    </div>
  );
}
