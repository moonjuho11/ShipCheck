"use client";

import { useState } from "react";
import { Collapse, SwapText } from "./motion";

export function ShareControls({ scanId, shareToken, initialPublic, appUrl, canBadge, productionReady }: { scanId: string; shareToken: string; initialPublic: boolean; appUrl: string; canBadge: boolean; productionReady: boolean }) {
  const [isPublic, setPublic] = useState(initialPublic);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const link = `${appUrl}/r/${shareToken}`;
  const badgeUrl = `${appUrl}/api/badge/${shareToken}`;
  const markdown = `[![Seaproof](${badgeUrl})](${link})`;

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
    <div className="card p-4">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-[14px] font-medium text-ink">Public link</h3>
        <button type="button" role="switch" aria-checked={isPublic} onClick={toggle} disabled={busy}
          className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition ${isPublic ? "bg-accent" : "bg-white/15"}`}>
          <span className="sr-only">Make report public</span>
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${isPublic ? "left-[18px]" : "left-0.5"}`} />
        </button>
      </div>
      <Collapse open={isPublic}>
        <div className="space-y-3 pt-4">
          <CopyRow value={link} label="Public link" copied={copied === "link"} onCopy={() => copy(link, "link")} />
          {canBadge && productionReady && (
            <div className="space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={badgeUrl} alt="Seaproof badge" className="h-5" />
              <CopyRow value={markdown} label="Badge markdown" copied={copied === "badge"} onCopy={() => copy(markdown, "badge")} />
            </div>
          )}
        </div>
      </Collapse>
    </div>
  );
}

function CopyRow({ value, label, copied, onCopy }: { value: string; label: string; copied: boolean; onCopy: () => void }) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-line bg-panel-2 py-1 pr-1 pl-2.5">
      <input readOnly value={value} aria-label={label} className="min-w-0 flex-1 bg-transparent font-mono text-[11.5px] text-ink-3 focus:outline-none" />
      <button type="button" onClick={onCopy} className={`h-7 shrink-0 rounded-md px-2.5 text-[12px] font-medium transition ${copied ? "bg-accent text-white" : "bg-white/[0.07] text-ink-2 hover:bg-white/[0.12]"}`}><SwapText active={copied} idle="Copy" done="Copied" /></button>
    </div>
  );
}
