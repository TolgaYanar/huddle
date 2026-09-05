const crypto = require("node:crypto");
const net = require("node:net");

const {
  MAX_TTL_SECONDS: CLOUDFLARE_MAX_TTL_SECONDS,
} = require("./cloudflareTurn");

/*
 * ICE server configuration issued by the server.
 *
 * STUN only finds a path when at least one side has a cooperative NAT. Two
 * peers behind symmetric NAT (mobile carriers, most corporate and campus
 * networks) need a TURN relay, and a relay needs credentials. Those must not
 * live in the web bundle: anything under NEXT_PUBLIC_ is public, cannot be
 * rotated without a redeploy, and would let anyone relay traffic on our bill
 * for as long as the secret is valid.
 *
 * So the server mints them. In "cloudflare" mode it asks Cloudflare Realtime
 * for a short-lived credential over their API (see cloudflareTurn.js), because
 * Cloudflare deliberately does not accept a locally computed shared-secret
 * credential. In "hmac" mode it implements the TURN REST API
 * scheme (coturn `use-auth-secret`, also spoken by most managed relays):
 *   username   = "<unix expiry>:<random label>"
 *   credential = base64(HMAC-SHA1(secret, username))
 * The relay verifies the HMAC with the same shared secret, so no request ever
 * reaches our server and the credential is worthless once its expiry passes.
 * "static" mode serves a provider-issued fixed pair for relays that do not
 * support the scheme; it is still served from here so it can be rotated
 * without touching the web app.
 *
 * TTL note: a TURN server checks the expiry on every authenticated request,
 * including the Refresh that keeps an allocation alive. A credential that
 * expires mid-call therefore drops the relayed connection. The default is
 * one hour: clients refresh and ICE-restart before then, while a leaked guest
 * credential has a deliberately short value window.
 */

const DEFAULT_STUN_URLS = ["stun:stun.l.google.com:19302"];
const DEFAULT_TTL_SECONDS = 60 * 60;
const MIN_TTL_SECONDS = 10 * 60;
const MAX_TTL_SECONDS = 7 * 24 * 60 * 60;

function parseUrlList(raw, allowedSchemes, validateUrl = () => true) {
  if (typeof raw !== "string") return { urls: [], rejected: [] };
  const urls = [];
  const rejected = [];
  for (const piece of raw.split(",")) {
    const url = piece.trim();
    if (!url) continue;
    const scheme = url.slice(0, url.indexOf(":"));
    if (
      allowedSchemes.includes(scheme) &&
      url.length > scheme.length + 1 &&
      validateUrl(url)
    ) {
      urls.push(url);
    } else {
      rejected.push(url);
    }
  }
  return { urls, rejected };
}

function isValidHostname(host) {
  if (!host || host.length > 253) return false;
  if (net.isIP(host) === 4) return true;
  // A dotted numeric value that is not an IPv4 address must not fall through
  // and be accepted as a DNS name (for example 999.999.999.999).
  if (/^[0-9.]+$/.test(host)) return false;
  const normalized = host.endsWith(".") ? host.slice(0, -1) : host;
  if (!normalized) return false;
  return normalized
    .split(".")
    .every(
      (label) =>
        label.length > 0 &&
        label.length <= 63 &&
        /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label),
    );
}

// TURN URLs use an opaque URI syntax, so `new URL()` does not validate their
// host or port. Parse the RFC 7065 shape explicitly before a URL is allowed to
// make startup or /health claim that a relay is configured.
function isValidTurnUrl(url) {
  const schemeEnd = url.indexOf(":");
  const scheme = url.slice(0, schemeEnd);
  if (scheme !== "turn" && scheme !== "turns") return false;

  const remainder = url.slice(schemeEnd + 1);
  if (!remainder || /[\s#]/.test(remainder)) return false;
  const queryParts = remainder.split("?");
  if (queryParts.length > 2) return false;
  const [endpoint, query] = queryParts;
  if (!endpoint) return false;
  if (query !== undefined && !/^transport=(?:udp|tcp)$/i.test(query)) {
    return false;
  }

  let host;
  let port;
  if (endpoint.startsWith("[")) {
    const close = endpoint.indexOf("]");
    if (close < 0) return false;
    host = endpoint.slice(1, close);
    const suffix = endpoint.slice(close + 1);
    if (suffix) {
      if (!suffix.startsWith(":")) return false;
      port = suffix.slice(1);
    }
    if (net.isIP(host) !== 6) return false;
  } else {
    if (endpoint.includes("[") || endpoint.includes("]")) return false;
    const firstColon = endpoint.indexOf(":");
    const lastColon = endpoint.lastIndexOf(":");
    if (firstColon !== lastColon) return false; // IPv6 must be bracketed.
    if (lastColon >= 0) {
      host = endpoint.slice(0, lastColon);
      port = endpoint.slice(lastColon + 1);
    } else {
      host = endpoint;
    }
    if (!isValidHostname(host)) return false;
  }

  if (port !== undefined) {
    if (!/^\d+$/.test(port)) return false;
    const numericPort = Number(port);
    if (numericPort < 1 || numericPort > 65535) return false;
  }
  return true;
}

function parseTtl(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return { ttlSeconds: DEFAULT_TTL_SECONDS, warning: null };
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    return {
      ttlSeconds: DEFAULT_TTL_SECONDS,
      warning: `TURN_TTL_SECONDS="${raw}" is not a whole number; using ${DEFAULT_TTL_SECONDS}`,
    };
  }
  if (parsed < MIN_TTL_SECONDS || parsed > MAX_TTL_SECONDS) {
    return {
      ttlSeconds: Math.min(MAX_TTL_SECONDS, Math.max(MIN_TTL_SECONDS, parsed)),
      warning: `TURN_TTL_SECONDS=${parsed} is outside ${MIN_TTL_SECONDS}..${MAX_TTL_SECONDS}; clamped`,
    };
  }
  return { ttlSeconds: parsed, warning: null };
}

function parseRequiredFlag(raw, warnings) {
  const normalized = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!normalized || normalized === "0" || normalized === "false") {
    return false;
  }
  if (normalized === "1" || normalized === "true") return true;
  warnings.push(
    `REQUIRE_TURN="${raw}" is not 0, 1, false, or true; treating it as enabled for safety`,
  );
  return true;
}

/**
 * Read relay configuration from the environment once, at startup.
 *
 * Misconfiguration never throws: a room with STUN only is degraded, a room
 * with no ICE servers at all is broken. Every problem is returned as a
 * warning so the operator sees it in the boot log instead of discovering it
 * from users whose calls "sometimes" fail.
 */
function readIceConfig(env = process.env) {
  const warnings = [];
  const requireTurn = parseRequiredFlag(env.REQUIRE_TURN, warnings);

  const stun = parseUrlList(env.STUN_URLS, ["stun", "stuns"]);
  for (const url of stun.rejected) {
    warnings.push(`STUN_URLS entry "${url}" ignored: expected stun:host:port`);
  }
  const stunUrls = stun.urls.length > 0 ? stun.urls : DEFAULT_STUN_URLS;

  const turn = parseUrlList(env.TURN_URLS, ["turn", "turns"], isValidTurnUrl);
  for (const url of turn.rejected) {
    warnings.push(
      `TURN_URLS entry "${url}" ignored: expected turn:host[:port][?transport=udp|tcp]`,
    );
  }

  const secret =
    typeof env.TURN_SECRET === "string" ? env.TURN_SECRET.trim() : "";
  const username =
    typeof env.TURN_USERNAME === "string" ? env.TURN_USERNAME.trim() : "";
  const credential =
    typeof env.TURN_CREDENTIAL === "string" ? env.TURN_CREDENTIAL.trim() : "";

  const cloudflareKeyId =
    typeof env.CLOUDFLARE_TURN_KEY_ID === "string"
      ? env.CLOUDFLARE_TURN_KEY_ID.trim()
      : "";
  const cloudflareApiToken =
    typeof env.CLOUDFLARE_TURN_API_TOKEN === "string"
      ? env.CLOUDFLARE_TURN_API_TOKEN.trim()
      : "";

  let { ttlSeconds, warning: ttlWarning } = parseTtl(env.TURN_TTL_SECONDS);
  if (ttlWarning) warnings.push(ttlWarning);

  let mode = "none";
  if (cloudflareKeyId && cloudflareApiToken) {
    mode = "cloudflare";
    if (turn.urls.length > 0 || secret || username || credential) {
      warnings.push(
        "Cloudflare TURN is configured, so TURN_URLS/TURN_SECRET/TURN_USERNAME/TURN_CREDENTIAL are ignored",
      );
    }
    if (ttlSeconds > CLOUDFLARE_MAX_TTL_SECONDS) {
      warnings.push(
        `TURN_TTL_SECONDS=${ttlSeconds} exceeds the ${CLOUDFLARE_MAX_TTL_SECONDS}s Cloudflare maximum; clamped`,
      );
      ttlSeconds = CLOUDFLARE_MAX_TTL_SECONDS;
    }
  } else if (cloudflareKeyId || cloudflareApiToken) {
    warnings.push(
      "CLOUDFLARE_TURN_KEY_ID and CLOUDFLARE_TURN_API_TOKEN must both be set; Cloudflare relay disabled",
    );
  }

  if (mode === "cloudflare") {
    // Handled above; the shared-secret branches below must not run.
  } else if (turn.urls.length > 0) {
    if (secret) {
      mode = "hmac";
      if (username || credential) {
        warnings.push(
          "TURN_SECRET is set, so TURN_USERNAME/TURN_CREDENTIAL are ignored",
        );
      }
    } else if (username && credential) {
      mode = "static";
    } else {
      warnings.push(
        "TURN_URLS is set without TURN_SECRET or TURN_USERNAME+TURN_CREDENTIAL; relay disabled, serving STUN only",
      );
    }
  } else if (secret || username || credential) {
    warnings.push(
      "TURN credentials are set but TURN_URLS is empty; relay disabled",
    );
  }

  // A fixed username/password served to a browser remains useful until an
  // operator rotates it. Keep static pairs for local/provider testing, but do
  // not expose them from production; expiring HMAC credentials are required.
  if (mode === "static" && env.NODE_ENV === "production") {
    warnings.push(
      "Static TURN credentials are disabled in production; configure TURN_SECRET for expiring HMAC credentials",
    );
    mode = "none";
  }

  return {
    mode,
    requireTurn,
    stunUrls,
    turnUrls: mode === "hmac" || mode === "static" ? turn.urls : [],
    secret: mode === "hmac" ? secret : null,
    username: mode === "static" ? username : null,
    credential: mode === "static" ? credential : null,
    cloudflareKeyId: mode === "cloudflare" ? cloudflareKeyId : null,
    cloudflareApiToken: mode === "cloudflare" ? cloudflareApiToken : null,
    ttlSeconds,
    warnings,
  };
}

/**
 * Operational state exposed by /health. This intentionally reports only
 * whether a relay can be issued, never relay URLs, usernames, or credentials.
 */
function getIceReadiness(config) {
  const relayConfigured =
    config?.mode === "hmac" ||
    config?.mode === "static" ||
    config?.mode === "cloudflare";
  return {
    status: relayConfigured ? "ready" : "degraded",
    relay: relayConfigured ? "configured" : "missing",
    required: config?.requireTurn === true,
  };
}

/**
 * Opt-in production guard. Liveness should stay healthy in the default
 * STUN-only development setup, while deployments that promise reliable voice
 * can set REQUIRE_TURN=1 and fail before accepting traffic if relay credentials
 * are absent or malformed.
 */
function assertIceReadiness(config) {
  const readiness = getIceReadiness(config);
  if (readiness.required && readiness.status !== "ready") {
    throw new Error(
      "REQUIRE_TURN is enabled, but no usable TURN relay is configured; set CLOUDFLARE_TURN_KEY_ID with CLOUDFLARE_TURN_API_TOKEN, or TURN_URLS with TURN_SECRET",
    );
  }
  return readiness;
}

/**
 * TURN REST API credential (coturn `use-auth-secret`).
 *
 * The label only has to be unique enough to avoid identical usernames; it is
 * random rather than a user or socket id so the relay never learns who is
 * calling whom.
 */
function mintTurnCredential({
  secret,
  ttlSeconds,
  now = Date.now(),
  label = crypto.randomBytes(8).toString("hex"),
}) {
  const expiresAt = Math.floor(now / 1000) + ttlSeconds;
  const username = `${expiresAt}:${label}`;
  const credential = crypto
    .createHmac("sha1", secret)
    .update(username)
    .digest("base64");
  return { username, credential, expiresAt };
}

/**
 * The body of GET /api/webrtc/ice. `ttlSeconds` is null when nothing in the
 * response expires, which tells the client there is nothing to refresh.
 */
function buildIceResponse(config, options = {}) {
  const iceServers = [{ urls: config.stunUrls }];

  if (config.mode === "hmac") {
    const minted = mintTurnCredential({
      secret: config.secret,
      ttlSeconds: config.ttlSeconds,
      now: options.now,
      label: options.label,
    });
    iceServers.push({
      urls: config.turnUrls,
      username: minted.username,
      credential: minted.credential,
    });
    return { iceServers, ttlSeconds: config.ttlSeconds };
  }

  if (config.mode === "static") {
    iceServers.push({
      urls: config.turnUrls,
      username: config.username,
      credential: config.credential,
    });
    return { iceServers, ttlSeconds: null };
  }

  // "none", and the fallback the route serves when a Cloudflare credential
  // could not be minted: STUN alone still connects the easy calls.
  return { iceServers, ttlSeconds: null };
}

module.exports = {
  DEFAULT_STUN_URLS,
  DEFAULT_TTL_SECONDS,
  MAX_TTL_SECONDS,
  MIN_TTL_SECONDS,
  buildIceResponse,
  assertIceReadiness,
  getIceReadiness,
  mintTurnCredential,
  readIceConfig,
};
