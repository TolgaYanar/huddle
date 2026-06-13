/**
 * SSRF guards shared by routes that fetch user-supplied URLs.
 *
 * `isPrivateIp` is intentionally strict: anything that cannot be parsed as a
 * valid public unicast address is treated as private (fail closed).
 */

import net from "node:net";

export type PreviewUrlValidation = { ok: true } | { ok: false; reason: string };

function parseIpv4Octets(
  ip: string
): [number, number, number, number] | null {
  if (net.isIP(ip) !== 4) return null;
  const parts = ip.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)
  ) {
    return null;
  }
  return parts as [number, number, number, number];
}

function isPrivateIpv4(octets: [number, number, number, number]): boolean {
  const [a, b, c] = octets;
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // 10/8 private
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 CGNAT
  if (a === 127) return true; // 127/8 loopback
  if (a === 169 && b === 254) return true; // 169.254/16 link-local (incl. cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12 private
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24 IETF protocol assignments
  if (a === 192 && b === 168) return true; // 192.168/16 private
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18/15 benchmarking
  if (a >= 224 && a <= 239) return true; // 224/4 multicast
  if (a >= 240) return true; // 240/4 reserved, incl. 255.255.255.255
  return false;
}

/**
 * Expands a valid IPv6 string into its 8 16-bit hextets, resolving `::`
 * compression and a trailing dotted-quad (e.g. `::ffff:10.0.0.1`).
 */
function parseIpv6Hextets(ip: string): number[] | null {
  if (net.isIP(ip) !== 6) return null;

  let s = ip;
  const zone = s.indexOf("%");
  if (zone !== -1) s = s.slice(0, zone);

  const tail: number[] = [];
  if (s.includes(".")) {
    const i = s.lastIndexOf(":");
    const quad = parseIpv4Octets(s.slice(i + 1));
    if (!quad) return null;
    tail.push((quad[0] << 8) | quad[1], (quad[2] << 8) | quad[3]);
    s = s.slice(0, i + 1);
  }

  const need = 8 - tail.length;
  let groups: string[];
  const di = s.indexOf("::");
  if (di !== -1) {
    const left = s.slice(0, di).split(":").filter(Boolean);
    const right = s.slice(di + 2).split(":").filter(Boolean);
    const fill = need - left.length - right.length;
    if (fill < 0) return null;
    groups = [...left, ...Array<string>(fill).fill("0"), ...right];
  } else {
    groups = s.split(":").filter(Boolean);
  }
  if (groups.length !== need) return null;

  const hextets = groups.map((g) => parseInt(g, 16));
  if (hextets.some((n) => !Number.isInteger(n) || n < 0 || n > 0xffff)) {
    return null;
  }
  return [...hextets, ...tail];
}

export function isPrivateIp(ip: string): boolean {
  const v4 = parseIpv4Octets(ip);
  if (v4) return isPrivateIpv4(v4);

  const h = parseIpv6Hextets(ip);
  // Unknown/unparseable: fail closed.
  if (!h) return true;

  const [h0, h1, h2, h3, h4, h5, h6, h7] = h as [
    number, number, number, number, number, number, number, number,
  ];

  if (h0 === 0 && h1 === 0 && h2 === 0 && h3 === 0 && h4 === 0 && h5 === 0) {
    // ::/96 — unspecified (::), loopback (::1), and the deprecated
    // IPv4-compatible range (::a.b.c.d). No legitimate public use.
    return true;
  }
  if ((h0 & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((h0 & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local

  const embeddedV4 = (): [number, number, number, number] => [
    h6 >> 8,
    h6 & 0xff,
    h7 >> 8,
    h7 & 0xff,
  ];
  if (h0 === 0 && h1 === 0 && h2 === 0 && h3 === 0 && h4 === 0 && h5 === 0xffff) {
    return isPrivateIpv4(embeddedV4()); // ::ffff:0:0/96 IPv4-mapped
  }
  if (h0 === 0x64 && h1 === 0xff9b && h2 === 0 && h3 === 0 && h4 === 0 && h5 === 0) {
    return isPrivateIpv4(embeddedV4()); // 64:ff9b::/96 NAT64
  }

  return false;
}

/**
 * Validates a user-supplied URL before any network activity. This is the
 * static half of the SSRF defense; the dynamic half is the connect-time DNS
 * filter in the route's undici Agent.
 */
export function validatePreviewUrl(url: URL): PreviewUrlValidation {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "Unsupported protocol" };
  }
  if (url.username !== "" || url.password !== "") {
    return { ok: false, reason: "Credentials not allowed" };
  }
  // URL normalizes the default port to "".
  if (url.port !== "" && url.port !== "80" && url.port !== "443") {
    return { ok: false, reason: "Blocked port" };
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    return { ok: false, reason: "Blocked host" };
  }

  // IPv6 literals keep their brackets in URL.hostname.
  const bare =
    hostname.startsWith("[") && hostname.endsWith("]")
      ? hostname.slice(1, -1)
      : hostname;
  if (net.isIP(bare) !== 0 && isPrivateIp(bare)) {
    return { ok: false, reason: "Blocked IP" };
  }

  return { ok: true };
}
