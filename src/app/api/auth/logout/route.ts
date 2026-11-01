import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { destroySession, isSameOrigin } from "@/lib/session";

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return new NextResponse("Forbidden", { status: 403 });
  await destroySession();
  return NextResponse.redirect(`${env.appUrl}/`, { status: 303 });
}
