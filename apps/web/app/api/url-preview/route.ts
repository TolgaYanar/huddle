import { NextResponse } from "next/server";
import dns from "node:dns/promises";
import net from "node:net";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UrlPreviewResponse =
  | {
      ok: true;
      title: string | null;
      thumbnail: string | null;
      finalUrl: string;
    }
  | {
      ok: false;
      error: string;
    };

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const raw = searchParams.get("url");

    if (!raw) {
      return NextResponse.json<UrlPreviewResponse>(
        { ok: false, error: "Missing url" },
        { status: 400 }
      );
    }

    let target: URL;
    try {
      target = new URL(raw);
    } catch {
      return NextResponse.json<UrlPreviewResponse>(
        { ok: false, error: "Invalid url" },
        { status: 400 }
      );
    }

    if (target.protocol !== "http:" && target.protocol !== "https:") {
      return NextResponse.json<UrlPreviewResponse>(
        { ok: false, error: "Unsupported protocol" },
        { status: 400 }
      );
    }

    // Basic SSRF guard: block obvious local hostnames.
    const hostname = target.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname === "0.0.0.0" ||
      hostname === "127.0.0.1" ||
      hostname === "::1"
    ) {
      return NextResponse.json<UrlPreviewResponse>(
        { ok: false, error: "Blocked host" },
        { status: 400 }
      );
    }

    // If hostname is an IP literal, validate it.
    if (net.isIP(hostname)) {
      if (isPrivateIp(hostname)) {
        return NextResponse.json<UrlPreviewResponse>(
          { ok: false, error: "Blocked IP" },
          { status: 400 }
        );
      }
    } else {
      // Resolve hostname and block private ranges.
      const addrs = await dns.lookup(hostname, { all: true, verbatim: true });
      if (addrs.some((a) => isPrivateIp(a.address))) {
        return NextResponse.json<UrlPreviewResponse>(
          { ok: false, error: "Blocked IP" },
          { status: 400 }
        );
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    let res: Response;
    try {
      res = await fetch(target.toString(), {
        signal: controller.signal,
        redirect: "follow",
        headers: {
          "user-agent":
            "Mozilla/5.0 (compatible; wehuddle-bot/1.0; +https://wehuddle.tv)",
          accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        },
        // Prevent caching during dev and keep previews fresh.
        cache: "no-store",
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const finalUrl = res.url || target.toString();

    if (!res.ok) {
      return NextResponse.json<UrlPreviewResponse>(
        { ok: false, error: `Upstream status ${res.status}` },
        { status: 200 }
      );
    }

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) {
      return NextResponse.json<UrlPreviewResponse>(
        { ok: true, title: null, thumbnail: null, finalUrl },
        { status: 200 }
      );
    }

    const html = await readTextWithLimit(res, 1_000_000);

    const title =
      extractMeta(html, "property", "og:title") ||
      extractMeta(html, "name", "twitter:title") ||
      extractTitleTag(html) ||
      null;

    const thumbnail =
      extractMeta(html, "property", "og:image") ||
      extractMeta(html, "name", "twitter:image") ||
      null;

    return NextResponse.json<UrlPreviewResponse>(
      {
        ok: true,
        title: title ? decodeEntities(title) : null,
        thumbnail: thumbnail ? absolutizeUrl(finalUrl, thumbnail) : null,
        finalUrl,
      },
      { status: 200 }
    );
  } catch (e) {
    void e;
    return NextResponse.json<UrlPreviewResponse>(
      { ok: false, error: "Preview failed" },
      { status: 200 }
    );
  }
}

function extractMeta(
  html: string,
  key: "property" | "name",
  value: string
): string | null {
  // Very small HTML meta parser: good enough for OG/Twitter tags.
  // Matches both orders: key/value then content, or content then key/value.
  const re1 = new RegExp(
    `<meta[^>]*\\b${key}=["']${escapeRegExp(value)}["'][^>]*\\bcontent=["']([^"']+)["'][^>]*>`,
    "i"
  );
  const m1 = html.match(re1);
  if (m1?.[1]) return m1[1];

  const re2 = new RegExp(
    `<meta[^>]*\\bcontent=["']([^"']+)["'][^>]*\\b${key}=["']${escapeRegExp(value)}["'][^>]*>`,
    "i"
  );
  const m2 = html.match(re2);
  if (m2?.[1]) return m2[1];

  return null;
}

function extractTitleTag(html: string): string | null {
  // Some parsers/tooling can get confused by a literal "</title>" token sequence.
  // Split it to be safe.
  const pattern = "<title[^>]*>([^<]+)<" + "/title>";
  const m = html.match(new RegExp(pattern, "i"));
  return m?.[1] ? m[1].trim() : null;
}

function escapeRegExp(s: string) {
  // Avoid regex literals here to keep parsers happy across toolchains.
  // Escapes characters that are special inside a RegExp pattern.
  const specials = new Set([
    "\\",
    "^",
    "$",
    ".",
    "|",
    "?",
    "*",
    "+",
    "(",
    ")",
    "[",
    "]",
    "{",
    "}",
  ]);
  let out = "";
  for (const ch of s) {
    out += specials.has(ch) ? `\\${ch}` : ch;
  }
  return out;
}

function decodeEntities(s: string) {
  return s
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .trim();
}

function absolutizeUrl(baseUrl: string, maybeRelative: string): string {
  try {
    return new URL(maybeRelative, baseUrl).toString();
  } catch {
    return maybeRelative;
  }
}

function isPrivateIp(ip: string): boolean {
  // IPv4
  if (net.isIP(ip) === 4) {
    const parts = ip.split(".").map((p) => Number(p));
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n)))
      return true;

    const a = parts[0] as number;
    const b = parts[1] as number;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
  }

  // IPv6 (block loopback, unique local, link-local)
  if (net.isIP(ip) === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1") return true;
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA
    if (lower.startsWith("fe80:")) return true; // link-local
    return false;
  }

  return true;
}

async function readTextWithLimit(res: Response, limitBytes: number) {
  if (!res.body) return "";

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    total += value.byteLength;
    if (total > limitBytes) break;

    chunks.push(value);
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    combined.set(c, offset);
    offset += c.byteLength;
  }

  return new TextDecoder("utf-8", { fatal: false }).decode(combined);
}
