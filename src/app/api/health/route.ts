import { NextResponse } from "next/server";
import { queueHealth } from "@/lib/queue";

// GET /api/health — for uptime monitors. 503 only when the database is down, because the
// site itself still works without workers; check workersOnline and oldestQueuedSeconds for those.
export async function GET() {
  const headers = { "cache-control": "no-store" };
  try {
    return NextResponse.json({ ok: true, ...(await queueHealth()) }, { headers });
  } catch {
    return NextResponse.json({ ok: false, error: "database unavailable" }, { status: 503, headers });
  }
}
