import { promises as dns } from "node:dns";
import net from "node:net";

export class BlockedTargetError extends Error {}

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((a, o) => (a << 8) + Number(o), 0) >>> 0;
}

const V4_BLOCKS: [string, number][] = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
];

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const n = ipv4ToInt(ip);
    return V4_BLOCKS.some(([base, bits]) => (n >>> (32 - bits)) === (ipv4ToInt(base) >>> (32 - bits)));
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return lower === "::" || lower === "::1" || /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower) || /^ff/.test(lower) || lower.startsWith("64:ff9b:") || lower.startsWith("2001:db8");
  }
  return true;
}

function allowPrivate() {
  return process.env.NODE_ENV !== "production" && process.env.SEAPROOF_ALLOW_PRIVATE_TARGETS === "1";
}

export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try { url = new URL(raw); } catch { throw new BlockedTargetError("That doesn't look like a valid web address."); }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new BlockedTargetError("Only http(s) addresses can be checked.");
  if (url.username || url.password) throw new BlockedTargetError("Addresses with embedded passwords aren't allowed.");
  if (allowPrivate()) return url;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (/^(localhost|.*\.localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i.test(host)) throw new BlockedTargetError("Private addresses can't be checked.");
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true, verbatim: true }).catch(() => { throw new BlockedTargetError(`We couldn't find the website ${host}.`); });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new BlockedTargetError("Private or internal addresses can't be checked.");
  return url;
}

export interface SafeResponse {
  url: string;
  status: number;
  headers: Headers;
  body: string;
  location?: string;
}

export interface SafeFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  follow?: boolean;
  maxBytes?: number;
  timeoutMs?: number;
}

const UA = "SeaproofBot/1.0 (+security audit requested by the site owner)";

/**
 * Fetch a user-supplied URL safely: http(s) only, public IPs only (checked on every
 * redirect hop), timeouts and a response size cap. Never sends cookies or credentials.
 */
export async function safeFetch(raw: string, opts: SafeFetchOptions = {}): Promise<SafeResponse> {
  let current = raw;
  for (let hop = 0; hop < 6; hop++) {
    const url = await assertPublicUrl(current);
    const res = await fetch(url, {
      method: opts.method || "GET",
      headers: { "user-agent": UA, accept: "*/*", ...(opts.headers || {}) },
      redirect: "manual",
      signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
    });
    const location = res.headers.get("location") || undefined;
    if (opts.follow && location && res.status >= 300 && res.status < 400) {
      await res.body?.cancel();
      current = new URL(location, url).toString();
      continue;
    }
    const body = await readCapped(res, opts.maxBytes ?? 2_000_000);
    return { url: url.toString(), status: res.status, headers: res.headers, body, location };
  }
  throw new BlockedTargetError("Too many redirects.");
}

async function readCapped(res: Response, max: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { chunks.push(value.slice(0, value.byteLength - (size - max))); await reader.cancel(); break; }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
