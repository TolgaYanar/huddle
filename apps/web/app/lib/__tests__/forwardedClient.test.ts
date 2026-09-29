import { describe, expect, it } from "vitest";

import {
  CLIENT_IP_HEADER,
  PROXY_SECRET_HEADER,
  buildUpstreamHeaders,
} from "../forwardedClient";

const SECRET = "s".repeat(64);

describe("buildUpstreamHeaders", () => {
  it("forwards Vercel's client address with the secret", () => {
    const out = buildUpstreamHeaders(
      new Headers({ "x-vercel-forwarded-for": "88.254.90.217", cookie: "a=b" }),
      SECRET,
    );
    expect(out.get(CLIENT_IP_HEADER)).toBe("88.254.90.217");
    expect(out.get(PROXY_SECRET_HEADER)).toBe(SECRET);
    expect(out.get("cookie")).toBe("a=b");
  });

  it("takes the first entry of a list and accepts IPv6", () => {
    const out = buildUpstreamHeaders(
      new Headers({ "x-vercel-forwarded-for": "2001:db8::1, 10.0.0.1" }),
      SECRET,
    );
    expect(out.get(CLIENT_IP_HEADER)).toBe("2001:db8::1");
  });

  it("drops browser-sent copies of both headers", () => {
    const planted = new Headers({
      [CLIENT_IP_HEADER]: "203.0.113.9",
      [PROXY_SECRET_HEADER]: "guess",
    });

    const withoutSecret = buildUpstreamHeaders(planted, undefined);
    expect(withoutSecret.has(CLIENT_IP_HEADER)).toBe(false);
    expect(withoutSecret.has(PROXY_SECRET_HEADER)).toBe(false);

    const withoutVercel = buildUpstreamHeaders(planted, SECRET);
    expect(withoutVercel.has(CLIENT_IP_HEADER)).toBe(false);
    expect(withoutVercel.has(PROXY_SECRET_HEADER)).toBe(false);
  });

  it("sends nothing when the secret is unset or blank", () => {
    for (const secret of [undefined, "", "   "]) {
      const out = buildUpstreamHeaders(
        new Headers({ "x-vercel-forwarded-for": "88.254.90.217" }),
        secret,
      );
      expect(out.has(CLIENT_IP_HEADER)).toBe(false);
      expect(out.has(PROXY_SECRET_HEADER)).toBe(false);
    }
  });

  it("sends nothing for a malformed address", () => {
    const out = buildUpstreamHeaders(
      new Headers({ "x-vercel-forwarded-for": "not an address" }),
      SECRET,
    );
    expect(out.has(CLIENT_IP_HEADER)).toBe(false);
    expect(out.has(PROXY_SECRET_HEADER)).toBe(false);
  });
});
