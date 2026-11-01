import { NextResponse, type NextRequest } from "next/server";
import { getScan, setPublic } from "@/lib/scans";
import { getSessionUserId, isSameOrigin } from "@/lib/session";

// POST /api/scans/:id/share { public: boolean }
export async function POST(req: NextRequest, ctx: RouteContext<"/api/scans/[id]/share">) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const userId = await getSessionUserId();
  const scan = userId ? await getScan(id) : null;
  if (!scan || scan.user_id !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (scan.status !== "completed") return NextResponse.json({ error: "The scan isn't finished yet." }, { status: 409 });
  const body = (await req.json().catch(() => ({}))) as { public?: boolean };
  await setPublic(scan.id, !!body.public);
  return NextResponse.json({ public: !!body.public, shareToken: scan.share_token });
}
