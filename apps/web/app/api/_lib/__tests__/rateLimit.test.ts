import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createRouteRateLimiter } from "../rateLimit";

function makeReq(ip = "1.2.3.4"): Request {
  return new Request("http://test.local/", {
    headers: { "x-forwarded-for": ip },
  });
}

describe("createRouteRateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows up to max hits per IP and 429s the next one", async () => {
    const limiter = createRouteRateLimiter({ windowMs: 60_000, max: 3 });
    expect(limiter(makeReq()).allowed).toBe(true);
    expect(limiter(makeReq()).allowed).toBe(true);
    expect(limiter(makeReq()).allowed).toBe(true);

    const blocked = limiter(makeReq());
    expect(blocked.allowed).toBe(false);
    if (blocked.allowed === false) {
      expect(blocked.response.status).toBe(429);
      expect(blocked.response.headers.get("Retry-After")).toBeTruthy();
      expect(blocked.response.headers.get("X-RateLimit-Limit")).toBe("3");
    }
  });

  it("buckets are independent per IP", () => {
    const limiter = createRouteRateLimiter({ windowMs: 60_000, max: 1 });
    expect(limiter(makeReq("1.1.1.1")).allowed).toBe(true);
    expect(limiter(makeReq("2.2.2.2")).allowed).toBe(true);
    expect(limiter(makeReq("1.1.1.1")).allowed).toBe(false);
    expect(limiter(makeReq("2.2.2.2")).allowed).toBe(false);
  });

  it("hits older than the window do not count", () => {
    const limiter = createRouteRateLimiter({ windowMs: 1000, max: 2 });
    expect(limiter(makeReq()).allowed).toBe(true);
    expect(limiter(makeReq()).allowed).toBe(true);
    expect(limiter(makeReq()).allowed).toBe(false);

    vi.advanceTimersByTime(1100);

    expect(limiter(makeReq()).allowed).toBe(true);
  });

  it("uses x-real-ip when x-forwarded-for is absent", () => {
    const limiter = createRouteRateLimiter({ windowMs: 60_000, max: 1 });
    const req = new Request("http://test.local/", {
      headers: { "x-real-ip": "9.9.9.9" },
    });
    expect(limiter(req).allowed).toBe(true);
    expect(limiter(req).allowed).toBe(false);
  });

  it("rejects invalid configuration", () => {
    expect(() => createRouteRateLimiter({ windowMs: 0, max: 1 })).toThrow();
    expect(() => createRouteRateLimiter({ windowMs: 1000, max: 0 })).toThrow();
  });

  it("returns custom body on 429 when provided", async () => {
    const limiter = createRouteRateLimiter({
      windowMs: 60_000,
      max: 1,
      body: { error: "slow_down", reason: "test" },
    });
    limiter(makeReq());
    const r = limiter(makeReq());
    expect(r.allowed).toBe(false);
    if (r.allowed === false) {
      const json = await r.response.json();
      expect(json).toEqual({ error: "slow_down", reason: "test" });
    }
  });
});
