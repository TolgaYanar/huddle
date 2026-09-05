/*
 * Cloudflare Realtime TURN credentials.
 *
 * Cloudflare does not speak the coturn shared-secret scheme, so a credential
 * cannot be computed locally the way `iceConfig.js` mints an HMAC one. It is
 * issued by their API instead, which means a network call — and a network
 * call must not sit in the hot path of every room join. So one credential is
 * minted, cached, and reused until it is close to expiry.
 *
 * That is safe because a TURN credential here identifies the account, not the
 * caller: everyone in a refresh window sharing one credential leaks nothing
 * that per-request minting would hide, and Cloudflare bills by relayed bytes
 * rather than by credential.
 *
 * Nothing in this module throws. A failed mint means the caller serves STUN
 * only, which is a degraded call; an exception would be no call at all.
 */

const CREDENTIALS_URL = (keyId) =>
  `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(
    keyId,
  )}/credentials/generate-ice-servers`;

// Cloudflare rejects a longer expiry.
const MAX_TTL_SECONDS = 48 * 60 * 60;
// Re-mint once a credential is this far through its life. The remainder is
// the safety margin: a call that started on the old credential keeps working
// while the new one takes over for connections opened after it.
const REFRESH_FRACTION = 0.8;
// A mint that hangs would hold the first room join of a cold server open.
const REQUEST_TIMEOUT_MS = 5000;

function normaliseIceServers(body) {
  const servers = body?.iceServers;
  // The API returns an array, but a single object is the shape used by some
  // of Cloudflare's own examples. Accept both rather than serving nothing.
  const list = Array.isArray(servers) ? servers : servers ? [servers] : [];
  const valid = list.filter((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const { urls } = entry;
    if (typeof urls === "string") return urls.length > 0;
    return (
      Array.isArray(urls) &&
      urls.length > 0 &&
      urls.every((u) => typeof u === "string")
    );
  });
  return valid.length > 0 ? valid : null;
}

/**
 * @returns an object with `getIceServers()` resolving to
 *   `{ iceServers, ttlSeconds }` or null when no usable credential exists.
 */
function createCloudflareTurnProvider(options) {
  const {
    keyId,
    apiToken,
    ttlSeconds,
    fetchImpl = globalThis.fetch,
    now = () => Date.now(),
    onError = () => {},
    timeoutMs = REQUEST_TIMEOUT_MS,
  } = options;

  let cached = null; // { iceServers, issuedAtMs, expiresAtMs, refreshAtMs }
  let inFlight = null;

  async function mint() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(CREDENTIALS_URL(keyId), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ttl: ttlSeconds }),
        signal: controller.signal,
      });
      if (!res.ok) {
        // 401/403 means the token is wrong or revoked — worth seeing in the
        // log, because the symptom otherwise is only "calls are STUN again".
        onError(`credential request failed with HTTP ${res.status}`);
        return null;
      }
      const iceServers = normaliseIceServers(await res.json());
      if (!iceServers) {
        onError("credential response had no usable iceServers");
        return null;
      }
      const issuedAtMs = now();
      cached = {
        iceServers,
        issuedAtMs,
        expiresAtMs: issuedAtMs + ttlSeconds * 1000,
        refreshAtMs: issuedAtMs + ttlSeconds * 1000 * REFRESH_FRACTION,
      };
      return cached;
    } catch (err) {
      onError(
        err?.name === "AbortError"
          ? `credential request timed out after ${timeoutMs} ms`
          : `credential request threw: ${err?.message ?? err}`,
      );
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  // Collapse concurrent callers onto one request. A cold server that receives
  // ten joins at once must not send ten credential requests.
  function mintOnce() {
    if (!inFlight) {
      inFlight = mint().finally(() => {
        inFlight = null;
      });
    }
    return inFlight;
  }

  async function getIceServers() {
    const nowMs = now();

    if (cached && nowMs < cached.refreshAtMs) {
      return toResult(cached, nowMs);
    }

    if (cached && nowMs < cached.expiresAtMs) {
      // Still valid, just stale. Serve it now and replace it in the
      // background so no room join waits on Cloudflare.
      void mintOnce();
      return toResult(cached, nowMs);
    }

    // Nothing usable is cached: either the first request since boot, or the
    // previous credential outlived its expiry. Both must wait for a real one.
    const minted = await mintOnce();
    if (minted) return toResult(minted, now());
    // Do not serve an expired credential — a TURN server rejects it, which
    // is worse than STUN because the client would stop looking for a path.
    cached = null;
    return null;
  }

  function toResult(entry, nowMs) {
    return {
      iceServers: entry.iceServers,
      // What the client can rely on, not the full TTL: it refreshes against
      // the time actually left on the credential it was handed.
      ttlSeconds: Math.max(1, Math.floor((entry.expiresAtMs - nowMs) / 1000)),
    };
  }

  return { getIceServers };
}

module.exports = {
  CREDENTIALS_URL,
  MAX_TTL_SECONDS,
  REFRESH_FRACTION,
  REQUEST_TIMEOUT_MS,
  createCloudflareTurnProvider,
};
