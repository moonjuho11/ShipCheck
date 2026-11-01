import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { sql } from "./db";
import { env } from "./env";
import type { UserRow } from "./types";

const COOKIE = "sc_session";
const MAX_AGE = 60 * 60 * 24 * 30;
const key = () => new TextEncoder().encode(env.sessionSecret);

export async function createSession(userId: string) {
  const token = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(userId).setIssuedAt().setExpirationTime(`${MAX_AGE}s`).sign(key());
  (await cookies()).set(COOKIE, token, { httpOnly: true, secure: env.isProd, sameSite: "lax", path: "/", maxAge: MAX_AGE });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

export async function getSessionUserId(): Promise<string | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export async function getCurrentUser(): Promise<UserRow | null> {
  const id = await getSessionUserId();
  if (!id) return null;
  const [u] = await sql()<UserRow[]>`select * from users where id = ${id}`;
  return u ?? null;
}

/** Same-origin check for state-changing requests (defence in depth on top of SameSite=Lax). */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return req.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === new URL(env.appUrl).host || new URL(origin).host === new URL(req.url).host; } catch { return false; }
}

/** Only allow redirects to our own relative paths. */
export function safeNext(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
