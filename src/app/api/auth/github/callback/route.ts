import { NextResponse, type NextRequest } from "next/server";
import { safeEqual, encrypt } from "@/lib/crypto";
import { sql } from "@/lib/db";
import { env } from "@/lib/env";
import { exchangeCode, getGitHubUser } from "@/lib/github";
import { createSession, safeNext } from "@/lib/session";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  let saved: { state?: string; next?: string } = {};
  try { saved = JSON.parse(req.cookies.get("sc_oauth")?.value || "{}"); } catch { /* ignore */ }
  const fail = (msg: string) => NextResponse.redirect(`${env.appUrl}/?error=${encodeURIComponent(msg)}`);
  if (!code || !state || !saved.state || !safeEqual(state, saved.state)) return fail("GitHub login expired. Please try again.");

  try {
    const { token, scopes } = await exchangeCode(code);
    const gh = await getGitHubUser(token);
    const [user] = await sql()<{ id: string }[]>`
      insert into users (github_id, github_login, name, avatar_url, email, github_token_enc, github_scopes)
      values (${gh.id}, ${gh.login}, ${gh.name}, ${gh.avatar_url}, ${gh.email}, ${encrypt(token)}, ${scopes})
      on conflict (github_id) do update set
        github_login = excluded.github_login, name = excluded.name, avatar_url = excluded.avatar_url,
        email = coalesce(excluded.email, users.email), github_token_enc = excluded.github_token_enc,
        github_scopes = excluded.github_scopes, updated_at = now()
      returning id`;
    await createSession(user.id);
    const res = NextResponse.redirect(`${env.appUrl}${safeNext(saved.next)}`);
    res.cookies.delete({ name: "sc_oauth", path: "/api/auth/github" });
    return res;
  } catch (e) {
    console.error("oauth callback failed", (e as Error).message);
    return fail("GitHub login failed. Please try again.");
  }
}
