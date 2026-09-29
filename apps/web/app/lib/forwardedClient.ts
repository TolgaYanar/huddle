/**
 * Headers the backend reads to key its rate limits on the real user
 * (apps/server/src/auth/clientIp.js). Behind the rewrite in next.config.js the
 * backend only sees Vercel's egress address, so the web proxy forwards the
 * user's address together with a shared secret that proves it came from here.
 */
export const CLIENT_IP_HEADER = "x-huddle-client-ip";
export const PROXY_SECRET_HEADER = "x-huddle-proxy-secret";

// Vercel overwrites this header with the connecting address, so a browser
// cannot choose its value when the request arrives through Vercel.
const VERCEL_FORWARDED_FOR = "x-vercel-forwarded-for";

// Loose shape check only; the backend validates the address properly.
const ADDRESS_SHAPE = /^[0-9a-fA-F:.]{2,45}$/;

/**
 * Returns the headers to send upstream. Any copy of the two headers a browser
 * sent is always dropped; both are set only when a secret is configured and
 * Vercel supplied the user's address (it does not in local development).
 */
export function buildUpstreamHeaders(
  incoming: Headers,
  secret: string | undefined,
): Headers {
  const headers = new Headers(incoming);
  headers.delete(CLIENT_IP_HEADER);
  headers.delete(PROXY_SECRET_HEADER);

  const trimmedSecret = secret?.trim();
  if (!trimmedSecret) return headers;

  const [first = ""] = (incoming.get(VERCEL_FORWARDED_FOR) ?? "").split(",");
  const address = first.trim();
  if (!ADDRESS_SHAPE.test(address)) return headers;

  headers.set(CLIENT_IP_HEADER, address);
  headers.set(PROXY_SECRET_HEADER, trimmedSecret);
  return headers;
}
