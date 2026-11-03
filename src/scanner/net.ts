import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import { ScanRejected } from "./errors";

export class BlockedTargetError extends ScanRejected {}

// BlockList checks IPv4-mapped IPv6 addresses against the IPv4 rules, however they're written.
const BLOCKED = new net.BlockList();
for (const [base, bits] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) BLOCKED.addSubnet(base, bits, "ipv4");
for (const [base, bits] of [
  ["::", 96], // unspecified, loopback and IPv4-compatible
  ["64:ff9b::", 96], ["64:ff9b:1::", 48], ["2002::", 16], ["2001::", 32], // NAT64, 6to4, Teredo: all can reach IPv4
  ["100::", 64], ["2001:db8::", 32], ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8],
] as const) BLOCKED.addSubnet(base, bits, "ipv6");

export function isPrivateIp(ip: string): boolean {
  const bare = ip.split("%")[0]; // link-local addresses can carry a zone like fe80::1%eth0
  if (net.isIPv4(bare)) return BLOCKED.check(bare, "ipv4");
  if (net.isIPv6(bare)) return BLOCKED.check(bare, "ipv6");
  return true;
}

const PRIVATE_MESSAGE = "Private or internal addresses can't be checked.";

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
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.promises.lookup(host, { all: true, verbatim: true }).catch(() => { throw new BlockedTargetError(`We couldn't find the website ${host}.`); });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new BlockedTargetError(PRIVATE_MESSAGE);
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

// Runs when the socket connects, so a domain can't pass the check above and then
// resolve to a private address for the real request (DNS rebinding).
const guardedLookup: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true, verbatim: true }, (err, addresses) => {
    if (err) return (callback as (e: Error) => void)(err);
    if (!allowPrivate() && (!addresses.length || addresses.some((a) => isPrivateIp(a.address)))) return (callback as (e: Error) => void)(new BlockedTargetError(PRIVATE_MESSAGE));
    if (options.all) return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, addresses);
    callback(null, addresses[0].address, addresses[0].family);
  });
};

function toHeaders(raw: http.IncomingHttpHeaders): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(raw)) {
    for (const v of Array.isArray(value) ? value : [value ?? ""]) {
      try { headers.append(name, v); } catch { /* a malformed header from the site we're checking */ }
    }
  }
  return headers;
}

function request(url: URL, opts: SafeFetchOptions): Promise<SafeResponse> {
  const max = opts.maxBytes ?? 2_000_000;
  return new Promise((resolve, reject) => {
    const send = url.protocol === "https:" ? https.request : http.request;
    const req = send(url, {
      method: opts.method || "GET",
      headers: { "user-agent": UA, accept: "*/*", ...(opts.headers || {}) },
      lookup: guardedLookup,
      agent: false,
      signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
    }, (res) => {
      const status = res.statusCode ?? 0;
      const location = res.headers.location;
      const answer = (body: string) => resolve({ url: url.toString(), status, headers: toHeaders(res.headers), body, location });
      if (opts.follow && location && status >= 300 && status < 400) { req.destroy(); return answer(""); }

      // We don't ask for compression, but some servers send it anyway.
      const encoding = res.headers["content-encoding"];
      const body = encoding === "gzip" ? res.pipe(createGunzip()) : encoding === "br" ? res.pipe(createBrotliDecompress()) : encoding === "deflate" ? res.pipe(createInflate()) : res;
      const chunks: Buffer[] = [];
      let size = 0;
      const finish = () => answer(Buffer.concat(chunks).toString("utf8"));
      body.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size <= max) return void chunks.push(chunk);
        chunks.push(chunk.subarray(0, chunk.length - (size - max)));
        finish();
        req.destroy();
      });
      body.on("end", finish);
      body.on("error", reject);
      res.on("error", reject);
    });
    req.on("error", reject);
    req.end();
  });
}

/**
 * Fetch a user-supplied URL safely: http(s) only, public IPs only (checked on every
 * redirect hop and again at connect time), timeouts and a response size cap. Never
 * sends cookies or credentials.
 */
export async function safeFetch(raw: string, opts: SafeFetchOptions = {}): Promise<SafeResponse> {
  let current = raw;
  for (let hop = 0; hop < 6; hop++) {
    const url = await assertPublicUrl(current);
    const res = await request(url, opts);
    if (opts.follow && res.location && res.status >= 300 && res.status < 400) {
      current = new URL(res.location, url).toString();
      continue;
    }
    return res;
  }
  throw new BlockedTargetError("Too many redirects.");
}
