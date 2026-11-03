import { NextResponse, type NextRequest } from "next/server";
import { cancelScan } from "@/lib/scans";
import { getSessionUserId, isSameOrigin } from "@/lib/session";

// POST /api/scans/:id/cancel — stop a scan the user started.
export async function POST(req: NextRequest, ctx: RouteContext<"/api/scans/[id]/cancel">) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await cancelScan(id, userId))) return NextResponse.json({ error: "This scan can't be canceled." }, { status: 409 });
  return NextResponse.json({ ok: true });
}
