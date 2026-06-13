/**
 * Per-IP sliding-window rate limiter for Next.js route handlers.
 *
 * Uses an in-process Map keyed by IP. On Vercel each region/lambda instance
 * keeps its own bucket — adequate as defense-in-depth against single-client
 * abuse, but a shared store (Upstash/KV) would be required for strict
 * cross-region limits.
 *
 * Client IP trust: x-real-ip first (Vercel sets it authoritatively; nginx
 * only when configured with `proxy_set_header X-Real-IP $remote_addr`), else
 * the LAST x-forwarded-for entry (trusted proxies append, so spoofed values
 * only shift left of the trusted tail). With no reverse proxy at all neither
 * header is trustworthy and all clients may share one bucket.
 *
 * Usage:
 *   const limiter = createRouteRateLimiter({ windowMs: 60_000, max: 30 });
 *   export async function GET(req: Request) {
 *     const r = limiter(req);
 *     if (!r.allowed) return r.response;
 *     ...
 *   }
 */

import { NextResponse } from "next/server";

interface Options {
  windowMs: number;
  max: number;
  /** Body returned with the 429 response. Defaults to `{ error: "rate_limited" }`. */
  body?: unknown;
  /**
   * Cap on distinct IP buckets; the oldest-inserted bucket is evicted when a
   * new key would exceed it. Bounds memory under key-rotation attacks.
   * Defaults to 10_000.
   */
  maxKeys?: number;
}

interface AllowedResult {
  allowed: true;
  remaining: number;
}

interface BlockedResult {
  allowed: false;
  response: NextResponse;
}

type Result = AllowedResult | BlockedResult;

function getClientIp(req: Request): string {
  const headers = req.headers;
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const entries = forwarded.split(",").map((s) => s.trim());
    // Rightmost non-empty entry is the nearest trusted proxy's observation.
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (entry) return entry;
    }
  }
  return "unknown";
}

export function createRouteRateLimiter({
  windowMs,
  max,
  body = { error: "rate_limited" },
  maxKeys = 10_000,
}: Options) {
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new Error("windowMs must be a positive number");
  }
  if (!Number.isFinite(max) || max <= 0) {
    throw new Error("max must be a positive number");
  }
  if (!Number.isFinite(maxKeys) || maxKeys <= 0) {
    throw new Error("maxKeys must be a positive number");
  }

  // ip -> array of timestamps
  const store = new Map<string, number[]>();

  // Periodically prune. unref so the timer doesn't keep the process alive.
  const prune = setInterval(() => {
    const now = Date.now();
    for (const [ip, hits] of store.entries()) {
      const valid = hits.filter((t) => now - t < windowMs);
      if (valid.length === 0) store.delete(ip);
      else store.set(ip, valid);
    }
  }, windowMs);
  if (typeof prune.unref === "function") prune.unref();

  return function tryHit(req: Request): Result {
    const ip = getClientIp(req);
    const now = Date.now();
    const raw = store.get(ip) ?? [];
    const hits = raw.filter((t) => now - t < windowMs);

    if (hits.length >= max) {
      const oldest = hits[0] ?? now;
      const retryAfter = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
      const response = NextResponse.json(body, {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": String(max),
          "X-RateLimit-Remaining": "0",
        },
      });
      return { allowed: false, response };
    }

    hits.push(now);
    if (!store.has(ip) && store.size >= maxKeys) {
      // Evict the oldest-inserted bucket so the store stays bounded even
      // under key-rotation attacks.
      const oldestKey = store.keys().next().value;
      if (oldestKey !== undefined) store.delete(oldestKey);
    }
    store.set(ip, hits);
    return { allowed: true, remaining: max - hits.length };
  };
}
