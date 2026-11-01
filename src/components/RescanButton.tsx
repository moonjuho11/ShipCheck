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
      <button type="button" onClick={go} disabled={busy} className="btn-ghost">{busy ? <Spinner /> : "↻"} {label}</button>
      {error && <p className="mt-1 max-w-xs text-right text-xs text-red-600">{error}</p>}
    </div>
  );
}
