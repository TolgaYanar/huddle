import { describe, expect, it } from "vitest";

import { isPrivateIp, validatePreviewUrl } from "../ssrf";

describe("isPrivateIp", () => {
  const blocked = [
    // IPv4-mapped IPv6, dotted and hex forms
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1",
    "::ffff:a9fe:a9fe", // 169.254.169.254 hex-mapped
    // IPv4 ranges
    "0.0.0.0",
    "10.1.2.3",
    "100.64.0.1", // CGNAT
    "127.0.0.1",
    "169.254.169.254", // link-local / cloud metadata
    "172.16.0.1",
    "192.0.0.192",
    "192.168.1.1",
    "198.18.0.1",
    "224.0.0.1", // multicast
    "240.0.0.1",
    "255.255.255.255",
    // IPv6 ranges
    "::",
    "::1",
    "::127.0.0.1", // deprecated IPv4-compatible form
    "::8.8.8.8", // entire ::/96 is blocked, even public-looking embeds
    "fe80::1",
    "fd00::1",
    "fc00::1",
    "64:ff9b::7f00:1", // NAT64-embedded 127.0.0.1
  ];

  it.each(blocked)("blocks %s", (ip) => {
    expect(isPrivateIp(ip)).toBe(true);
  });

  const allowed = [
    "8.8.8.8",
    "1.1.1.1",
    "93.184.216.34",
    "2606:4700::1111",
  ];

  it.each(allowed)("allows %s", (ip) => {
    expect(isPrivateIp(ip)).toBe(false);
  });

  it("blocks garbage strings (fail closed)", () => {
    expect(isPrivateIp("")).toBe(true);
    expect(isPrivateIp("not-an-ip")).toBe(true);
    expect(isPrivateIp("999.999.999.999")).toBe(true);
    expect(isPrivateIp("example.com")).toBe(true);
    expect(isPrivateIp("::gggg")).toBe(true);
  });
});

describe("validatePreviewUrl", () => {
  const rejected = [
    "javascript:alert(1)",
    "file:///etc/passwd",
    "ftp://example.com/",
    "http://user:pass@example.com/",
    "http://example.com:8080/",
    "http://localhost/",
    "http://foo.localhost/",
    "http://127.0.0.1/",
    "http://[::1]/",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::ffff:10.0.0.1]/",
  ];

  it.each(rejected)("rejects %s", (raw) => {
    const result = validatePreviewUrl(new URL(raw));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBeTruthy();
  });

  const accepted = [
    "http://example.com:80/",
    "https://example.com:443/",
    "https://example.com/",
    "http://example.com/path?q=1",
    "https://[2606:4700::1111]/",
  ];

  it.each(accepted)("accepts %s", (raw) => {
    expect(validatePreviewUrl(new URL(raw))).toEqual({ ok: true });
  });
});
