"use client";

import { useState } from "react";

export function ShareControls({ scanId, shareToken, initialPublic, appUrl, canBadge, productionReady }: { scanId: string; shareToken: string; initialPublic: boolean; appUrl: string; canBadge: boolean; productionReady: boolean }) {
  const [isPublic, setPublic] = useState(initialPublic);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const link = `${appUrl}/r/${shareToken}`;
  const badgeUrl = `${appUrl}/api/badge/${shareToken}`;
  const markdown = `[![ShipCheck](${badgeUrl})](${link})`;

  async function toggle() {
    setBusy(true);
    const res = await fetch(`/api/scans/${scanId}/share`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ public: !isPublic }) });
    if (res.ok) setPublic(!isPublic);
    setBusy(false);
  }
  async function copy(text: string, what: string) {
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopied(what); setTimeout(() => setCopied(null), 1800);
  }

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-slate-900">Share this report</h3>
          <p className="mt-0.5 text-sm text-slate-500">The public page shows your score and which areas passed — never file names or fix instructions.</p>
        </div>
        <button type="button" role="switch" aria-checked={isPublic} onClick={toggle} disabled={busy}
          className={`relative mt-1 inline-flex h-6 w-11 shrink-0 rounded-full transition ${isPublic ? "bg-brand-600" : "bg-slate-300"}`}>
          <span className="sr-only">Make report public</span>
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${isPublic ? "left-[22px]" : "left-0.5"}`} />
        </button>
      </div>
      {isPublic && (
        <div className="mt-4 space-y-3">
          <div className="flex gap-2">
            <input readOnly value={link} className="input !py-2 font-mono !text-xs" aria-label="Public link" />
            <button type="button" className="btn-ghost !py-2" onClick={() => copy(link, "link")}>{copied === "link" ? "Copied" : "Copy"}</button>
          </div>
          {canBadge && productionReady ? (
            <div>
              <p className="text-sm font-medium text-slate-700">Badge for your README or website</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={badgeUrl} alt="ShipCheck badge" className="mt-2 h-5" />
              <div className="mt-2 flex gap-2">
                <input readOnly value={markdown} className="input !py-2 font-mono !text-xs" aria-label="Badge markdown" />
                <button type="button" className="btn-ghost !py-2" onClick={() => copy(markdown, "badge")}>{copied === "badge" ? "Copied" : "Copy"}</button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500">{canBadge ? "The “Production Ready” badge unlocks once your scan passes." : "Pro members get an embeddable “Production Ready” badge for passing apps."}</p>
          )}
        </div>
      )}
    </div>
  );
}
