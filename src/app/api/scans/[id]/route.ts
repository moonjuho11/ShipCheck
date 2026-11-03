import { NextResponse, type NextRequest } from "next/server";
import { queueStatus } from "@/lib/queue";
import { getScan } from "@/lib/scans";
import { getSessionUserId } from "@/lib/session";

// GET /api/scans/:id — live progress for the owner's progress screen.
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/scans/[id]">) {
  const { id } = await ctx.params;
  const userId = await getSessionUserId();
  const scan = userId ? await getScan(id) : null;
  if (!scan || scan.user_id !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Queue details are a nice-to-have: never let them break the progress screen.
  const queue = scan.status === "queued" ? await queueStatus(scan.id).catch(() => null) : null;
  return NextResponse.json(
    { status: scan.status, steps: scan.steps, score: scan.score, productionReady: scan.production_ready, error: scan.error, queue, retrying: scan.status === "queued" && !!scan.started_at },
    { headers: { "cache-control": "no-store" } },
  );
}
