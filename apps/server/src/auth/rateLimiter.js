const { getClientIp } = require("./clientIp");

/**
 * Simple in-memory sliding-window rate limiter (no external dependencies).
 * Periodically cleans up stale entries to avoid unbounded memory growth.
 */

function createRateLimiter({
  windowMs,
  max,
  message = "rate_limited",
  keyGenerator,
  onLimit,
}) {
  // key -> array of timestamps (hits within current window)
  const store = new Map();

  // Clean up expired entries every windowMs to prevent memory leaks.
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [ip, hits] of store.entries()) {
      const valid = hits.filter((t) => now - t < windowMs);
      if (valid.length === 0) store.delete(ip);
      else store.set(ip, valid);
    }
  }, windowMs);

  // Don't hold the process open for cleanup alone.
  if (cleanupInterval.unref) cleanupInterval.unref();

  return function rateLimiterMiddleware(req, res, next) {
    // Never read X-Forwarded-For directly here: req.ip already applies the
    // trusted hop count, and the raw header's leftmost entry is client-chosen.
    const key =
      typeof keyGenerator === "function" ? keyGenerator(req) : getClientIp(req);

    const now = Date.now();
    const raw = store.get(key) || [];
    const hits = raw.filter((t) => now - t < windowMs);

    if (hits.length >= max) {
      const oldest = hits[0];
      const retryAfter = Math.ceil((oldest + windowMs - now) / 1000);
      res.set("Retry-After", String(retryAfter));
      if (typeof onLimit === "function") {
        return onLimit(req, res, { message, retryAfter });
      }
      return res.status(429).json({ error: message, retryAfter });
    }

    hits.push(now);
    store.set(key, hits);
    next();
  };
}

module.exports = { createRateLimiter };
