/**
 * Deadline for a single third-party request (YouTube, Wikipedia, Kick).
 *
 * Without one, a stalled upstream holds the function open until the platform
 * timeout — billed time, and the client sees a hang instead of the route's own
 * network-error response. Every caller already sits inside a try/catch, so an
 * abort takes that existing path.
 */
export const UPSTREAM_TIMEOUT_MS = 8_000;

export function upstreamSignal(): AbortSignal {
  return AbortSignal.timeout(UPSTREAM_TIMEOUT_MS);
}

/**
 * Parses an integer query parameter and clamps it to [min, max].
 * `Number("abc")` is NaN, and NaN survives Math.min/Math.max, so an unchecked
 * `?maxResults=abc` used to reach Google as the literal string "NaN".
 */
export function clampIntParam(
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = raw === null ? Number.NaN : Number.parseInt(raw, 10);
  const value = Number.isFinite(parsed) ? parsed : fallback;
  return Math.min(max, Math.max(min, value));
}

/**
 * Reads a response body, giving up (and cancelling the stream) once it
 * exceeds `limitBytes`. Returns null when the body is too large. Unlike
 * `res.arrayBuffer()`, an oversized or endless upstream body is never held in
 * memory in full.
 */
export async function readBytesWithLimit(
  res: Response,
  limitBytes: number,
): Promise<Uint8Array | null> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limitBytes) {
    res.body?.cancel().catch(() => {});
    return null;
  }
  if (!res.body) return new Uint8Array(0);

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > limitBytes) {
      reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}
