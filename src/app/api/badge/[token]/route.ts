import type { NextRequest } from "next/server";
import { getEntitlements } from "@/lib/plans";
import { latestScanForBadge } from "@/lib/scans";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const width = (s: string) => Math.round(s.length * 6.6 + 14);

function svg(label: string, message: string, color: string) {
  const lw = width(label), mw = width(message), w = lw + mw;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${esc(label)}: ${esc(message)}">
<title>${esc(label)}: ${esc(message)}</title>
<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
<clipPath id="r"><rect width="${w}" height="20" rx="3" fill="#fff"/></clipPath>
<g clip-path="url(#r)"><rect width="${lw}" height="20" fill="#334155"/><rect x="${lw}" width="${mw}" height="20" fill="${color}"/><rect width="${w}" height="20" fill="url(#s)"/></g>
<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
<text x="${lw / 2}" y="14">${esc(label)}</text><text x="${lw + mw / 2}" y="14">${esc(message)}</text></g></svg>`;
}

// GET /api/badge/:shareToken — embeddable SVG. Only passing scans of Pro accounts get a green badge;
// failing scans show "not verified" rather than advertising problems publicly.
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/badge/[token]">) {
  const { token } = await ctx.params;
  const scan = await latestScanForBadge(token.replace(/\.svg$/, ""));
  let body: string;
  if (!scan) body = svg("ShipCheck", "not found", "#94a3b8");
  else if (!(await getEntitlements(scan.user_id)).pro) body = svg("ShipCheck", "badge needs Pro", "#94a3b8");
  else if (scan.production_ready) body = svg("ShipCheck", `production ready ✓ ${scan.score}`, "#059669");
  else body = svg("ShipCheck", "not verified", "#94a3b8");
  return new Response(body, { headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=300, s-maxage=300" } });
}
