const crypto = require("node:crypto");

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
 * So the server mints them. In "hmac" mode it implements the TURN REST API
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
 * 24 hours, longer than any plausible watch party, and the client asks for a
 * fresh one well before that.
 */

const DEFAULT_STUN_URLS = ["stun:stun.l.google.com:19302"];
const DEFAULT_TTL_SECONDS = 24 * 60 * 60;
const MIN_TTL_SECONDS = 10 * 60;
const MAX_TTL_SECONDS = 7 * 24 * 60 * 60;

function parseUrlList(raw, allowedSchemes) {
  if (typeof raw !== "string") return { urls: [], rejected: [] };
  const urls = [];
  const rejected = [];
  for (const piece of raw.split(",")) {
    const url = piece.trim();
    if (!url) continue;
    const scheme = url.slice(0, url.indexOf(":"));
    if (allowedSchemes.includes(scheme) && url.length > scheme.length + 1) {
      urls.push(url);
    } else {
      rejected.push(url);
    }
  }
  return { urls, rejected };
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

  const stun = parseUrlList(env.STUN_URLS, ["stun", "stuns"]);
  for (const url of stun.rejected) {
    warnings.push(`STUN_URLS entry "${url}" ignored: expected stun:host:port`);
  }
  const stunUrls = stun.urls.length > 0 ? stun.urls : DEFAULT_STUN_URLS;

  const turn = parseUrlList(env.TURN_URLS, ["turn", "turns"]);
  for (const url of turn.rejected) {
    warnings.push(`TURN_URLS entry "${url}" ignored: expected turn:host:port`);
  }

  const secret =
    typeof env.TURN_SECRET === "string" ? env.TURN_SECRET.trim() : "";
  const username =
    typeof env.TURN_USERNAME === "string" ? env.TURN_USERNAME.trim() : "";
  const credential =
    typeof env.TURN_CREDENTIAL === "string" ? env.TURN_CREDENTIAL.trim() : "";

  const { ttlSeconds, warning: ttlWarning } = parseTtl(env.TURN_TTL_SECONDS);
  if (ttlWarning) warnings.push(ttlWarning);

  let mode = "none";
  if (turn.urls.length > 0) {
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

  return {
    mode,
    stunUrls,
    turnUrls: mode === "none" ? [] : turn.urls,
    secret: mode === "hmac" ? secret : null,
    username: mode === "static" ? username : null,
    credential: mode === "static" ? credential : null,
    ttlSeconds,
    warnings,
  };
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

  return { iceServers, ttlSeconds: null };
}

module.exports = {
  DEFAULT_STUN_URLS,
  DEFAULT_TTL_SECONDS,
  MAX_TTL_SECONDS,
  MIN_TTL_SECONDS,
  buildIceResponse,
  mintTurnCredential,
  readIceConfig,
};
