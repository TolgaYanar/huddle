import { NextResponse } from "next/server";
import dns from "node:dns";
import net from "node:net";

import {
  Agent,
  fetch as undiciFetch,
  type Response as UndiciResponse,
} from "undici";

import { createRouteRateLimiter } from "../_lib/rateLimit";
import { isPrivateIp, validatePreviewUrl } from "../_lib/ssrf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Outbound HTTP fetch to arbitrary URLs — most expensive route. 30/min/IP.
const limiter = createRouteRateLimiter({ windowMs: 60_000, max: 30 });

const MAX_URL_LENGTH = 2048;
const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

// Connect-time DNS filter: every connection (including each redirect hop)
// re-resolves the hostname and refuses to dial when any resolved address is
// private. This closes the DNS-rebinding window between any pre-check and the
// actual socket connect — GET's pre-checks only exist for friendly 400 errors.
const ssrfSafeLookup: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) {
      callback(err, "");
      return;
    }
    if (
      addresses.length === 0 ||
      addresses.some((a) => isPrivateIp(a.address))
    ) {
      callback(new Error(`Blocked address for host ${hostname}`), "");
      return;
    }
    if (options.all) {
      callback(null, addresses);
      return;
    }
    const first = addresses[0] as dns.LookupAddress;
    callback(null, first.address, first.family);
  });
};

const previewAgent = new Agent({ connect: { lookup: ssrfSafeLookup } });

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
  const r = limiter(req);
  if (!r.allowed) return r.response;

  try {
    const { searchParams } = new URL(req.url);
    const raw = searchParams.get("url");

    if (!raw) {
      return NextResponse.json<UrlPreviewResponse>(
        { ok: false, error: "Missing url" },
        { status: 400 }
      );
    }
    if (raw.length > MAX_URL_LENGTH) {
      return NextResponse.json<UrlPreviewResponse>(
        { ok: false, error: "URL too long" },
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

    const validation = validatePreviewUrl(target);
    if (!validation.ok) {
      return NextResponse.json<UrlPreviewResponse>(
        { ok: false, error: validation.reason },
        { status: 400 }
      );
    }

    // Friendly pre-check: resolve the first hop's hostname and 400 on private
    // ranges. The security boundary is previewAgent's connect-time lookup.
    const bareHostname = target.hostname.startsWith("[")
      ? target.hostname.slice(1, -1)
      : target.hostname;
    if (!net.isIP(bareHostname)) {
      const addrs = await dns.promises.lookup(bareHostname, {
        all: true,
        verbatim: true,
      });
      if (addrs.some((a) => isPrivateIp(a.address))) {
        return NextResponse.json<UrlPreviewResponse>(
          { ok: false, error: "Blocked IP" },
          { status: 400 }
        );
      }
    }

    const controller = new AbortController();
    // One total time budget shared by every redirect hop.
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    try {
      let current = target;
      for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
        if (!validatePreviewUrl(current).ok) {
          return NextResponse.json<UrlPreviewResponse>(
            { ok: false, error: "Preview failed" },
            { status: 200 }
          );
        }

        const res = await undiciFetch(current.toString(), {
          signal: controller.signal,
          redirect: "manual",
          dispatcher: previewAgent,
          headers: {
            "user-agent":
              "Mozilla/5.0 (compatible; wehuddle-bot/1.0; +https://wehuddle.tv)",
            accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
          },
          // Prevent caching during dev and keep previews fresh.
          cache: "no-store",
        });

        if (REDIRECT_STATUSES.has(res.status)) {
          res.body?.cancel().catch(() => {});
          const location = res.headers.get("location");
          if (!location) {
            return NextResponse.json<UrlPreviewResponse>(
              { ok: false, error: "Preview failed" },
              { status: 200 }
            );
          }
          try {
            current = new URL(location, current);
          } catch {
            return NextResponse.json<UrlPreviewResponse>(
              { ok: false, error: "Preview failed" },
              { status: 200 }
            );
          }
          continue;
        }

        const finalUrl = current.toString();

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
      }

      return NextResponse.json<UrlPreviewResponse>(
        { ok: false, error: "Too many redirects" },
        { status: 200 }
      );
    } finally {
      clearTimeout(timeoutId);
    }
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

async function readTextWithLimit(res: UndiciResponse, limitBytes: number) {
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
