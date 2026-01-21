const crypto = require("crypto");

const SESSION_COOKIE_NAME = "huddle_session";
const SESSION_TTL_DAYS = 30;

function sha256Hex(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function parseCookies(headerValue) {
  const out = {};
  if (!headerValue) return out;

  const parts = String(headerValue).split(";");
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (!key) continue;
    out[key] = decodeURIComponent(val);
  }
  return out;
}

function getRequestHost(req) {
  const forwardedHost = req?.headers?.["x-forwarded-host"];
  const raw = Array.isArray(forwardedHost)
    ? forwardedHost[0]
    : forwardedHost || req?.headers?.host;
  // Some proxies may send a comma-separated list.
  return String(raw || "")
    .split(",")[0]
    .trim();
}

function getCookieDomain(req) {
  const configured = process.env.COOKIE_DOMAIN;
  if (configured && String(configured).trim()) return String(configured).trim();

  // Only set a wide cookie domain in production.
  if (process.env.NODE_ENV !== "production") return undefined;

  const host = getRequestHost(req).toLowerCase();
  if (host === "wehuddle.tv" || host.endsWith(".wehuddle.tv")) {
    return ".wehuddle.tv";
  }
  return undefined;
}

function setSessionCookie(req, res, token) {
  const maxAgeSeconds = SESSION_TTL_DAYS * 24 * 60 * 60;
  const secure = process.env.NODE_ENV === "production";
  const domain = getCookieDomain(req);

  // Minimal cookie implementation (no external deps).
  const cookie = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    `Max-Age=${maxAgeSeconds}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (domain) cookie.push(`Domain=${domain}`);
  if (secure) cookie.push("Secure");
  res.setHeader("Set-Cookie", cookie.join("; "));
}

function clearSessionCookie(req, res) {
  const secure = process.env.NODE_ENV === "production";
  const domain = getCookieDomain(req);
  const cookie = [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "Max-Age=0",
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (domain) cookie.push(`Domain=${domain}`);
  if (secure) cookie.push("Secure");
  res.setHeader("Set-Cookie", cookie.join("; "));
}

function createSessionService({ getPrisma, isDbConnected }) {
  async function getAuthUser(req) {
    if (!isDbConnected() || !getPrisma()) return null;

    let token = null;

    const authHeader = req.headers.authorization;
    if (authHeader && typeof authHeader === "string") {
      const match = authHeader.match(/^Bearer\s+(.+)$/i);
      if (match && match[1]) token = match[1].trim();
    }

    if (!token) {
      const cookies = parseCookies(req.headers.cookie);
      token = cookies[SESSION_COOKIE_NAME] || null;
    }

    if (!token) return null;

    const tokenHash = sha256Hex(token);
    const now = new Date();

    const session = await getPrisma().session.findFirst({
      where: {
        tokenHash,
        expiresAt: { gt: now },
      },
      include: {
        user: { select: { id: true, username: true, createdAt: true } },
      },
    });

    return session?.user ?? null;
  }

  async function createSessionForUser(userId) {
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = sha256Hex(token);
    const expiresAt = new Date(
      Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
    );

    await getPrisma().session.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    });

    return { token, expiresAt };
  }

  return {
    getAuthUser,
    createSessionForUser,
  };
}

module.exports = {
  SESSION_COOKIE_NAME,
  SESSION_TTL_DAYS,
  sha256Hex,
  parseCookies,
  getCookieDomain,
  setSessionCookie,
  clearSessionCookie,
  createSessionService,
};
