/**
 * Simple in-memory sliding-window rate limiter (no external dependencies).
 * Periodically cleans up stale entries to avoid unbounded memory growth.
 */

function createRateLimiter({ windowMs, max, message = "rate_limited" }) {
  // ip -> array of timestamps (hits within current window)
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
    const ip =
      req.ip ||
      (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
      req.connection?.remoteAddress ||
      "unknown";

    const now = Date.now();
    const raw = store.get(ip) || [];
    const hits = raw.filter((t) => now - t < windowMs);

    if (hits.length >= max) {
      const oldest = hits[0];
      const retryAfter = Math.ceil((oldest + windowMs - now) / 1000);
      res.set("Retry-After", String(retryAfter));
      return res.status(429).json({ error: message, retryAfter });
    }

    hits.push(now);
    store.set(ip, hits);
    next();
  };
}

module.exports = { createRateLimiter };
