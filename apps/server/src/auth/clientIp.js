const crypto = require("crypto");
const net = require("net");

// The web app's proxy (apps/web/proxy.ts) forwards the user's address in
// CLIENT_IP_HEADER, together with PROXY_SHARED_SECRET in PROXY_SECRET_HEADER.
// Behind the Vercel rewrite req.ip is Vercel's egress, not the user, and a
// request sent straight to this server can forge any header — so the forwarded
// address is used only when the secret proves the request came through the web
// app. Without a configured secret it is never trusted.
const CLIENT_IP_HEADER = "x-huddle-client-ip";
const PROXY_SECRET_HEADER = "x-huddle-proxy-secret";
const MIN_SECRET_LENGTH = 32;
const MISMATCH_WARN_INTERVAL_MS = 60 * 1000;

function readProxySecret(env, warn = console.warn) {
  const raw = String(env.PROXY_SHARED_SECRET || "").trim();
  if (!raw) return null;
  if (raw.length < MIN_SECRET_LENGTH) {
    warn(
      `[client-ip] PROXY_SHARED_SECRET is shorter than ${MIN_SECRET_LENGTH} characters; ignoring it`,
    );
    return null;
  }
  return raw;
}

function secretMatches(provided, secret) {
  const a = Buffer.from(String(provided));
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Returns the address to key per-client limits on. Pure apart from `onMismatch`.
function resolveClientIp(req, { secret, onMismatch } = {}) {
  const fallback = req.ip || req.socket?.remoteAddress || "unknown";
  if (!secret) return fallback;

  const provided = req.headers?.[PROXY_SECRET_HEADER];
  if (provided === undefined) return fallback;
  if (!secretMatches(provided, secret)) {
    if (onMismatch) onMismatch();
    return fallback;
  }

  const forwarded = String(req.headers[CLIENT_IP_HEADER] || "").trim();
  return net.isIP(forwarded) ? forwarded : fallback;
}

function createClientIpResolver({
  secret,
  warn = console.warn,
  now = Date.now,
}) {
  let lastWarnAt = -Infinity;
  const onMismatch = () => {
    // A direct caller can send a wrong secret on every request; throttle so
    // that cannot flood the log. Never log the address or the value sent.
    const t = now();
    if (t - lastWarnAt < MISMATCH_WARN_INTERVAL_MS) return;
    lastWarnAt = t;
    warn("[client-ip] proxy secret mismatch; using the connecting address");
  };
  return (req) => resolveClientIp(req, { secret, onMismatch });
}

const getClientIp = createClientIpResolver({
  secret: readProxySecret(process.env),
});

module.exports = {
  CLIENT_IP_HEADER,
  PROXY_SECRET_HEADER,
  MIN_SECRET_LENGTH,
  readProxySecret,
  resolveClientIp,
  createClientIpResolver,
  getClientIp,
};
