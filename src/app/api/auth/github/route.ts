import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { authorizeUrl, LOGIN_SCOPES, PRIVATE_REPO_SCOPES } from "@/lib/github";
import { safeNext } from "@/lib/session";

// GET /api/auth/github?next=/dashboard[&scope=repo]
export async function GET(req: NextRequest) {
  const next = safeNext(req.nextUrl.searchParams.get("next"));
  const wantPrivate = req.nextUrl.searchParams.get("scope") === "repo";
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(authorizeUrl(state, wantPrivate ? PRIVATE_REPO_SCOPES : LOGIN_SCOPES));
  res.cookies.set("sc_oauth", JSON.stringify({ state, next }), { httpOnly: true, secure: env.isProd, sameSite: "lax", path: "/api/auth/github", maxAge: 600 });
  return res;
}
