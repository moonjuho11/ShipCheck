import { NextResponse, type NextRequest } from "next/server";
import { getScan } from "@/lib/scans";
import { getSessionUserId } from "@/lib/session";

// GET /api/scans/:id — live progress for the owner's progress screen.
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/scans/[id]">) {
  const { id } = await ctx.params;
  const userId = await getSessionUserId();
  const scan = userId ? await getScan(id) : null;
  if (!scan || scan.user_id !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(
    { status: scan.status, steps: scan.steps, score: scan.score, productionReady: scan.production_ready, error: scan.error },
    { headers: { "cache-control": "no-store" } },
  );
}
