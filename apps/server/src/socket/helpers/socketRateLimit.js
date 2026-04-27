/**
 * Per-socket sliding-window rate limiter.
 *
 * Returns a function that records a hit and tells the caller whether the
 * action should be allowed. The state is closed over per call site, so each
 * handler that wants its own bucket can call `createSocketRateLimiter` once
 * inside the connection scope.
 *
 * Usage:
 *   const limiter = createSocketRateLimiter({ windowMs: 1000, max: 5 });
 *   socket.on("event", () => {
 *     if (!limiter()) return; // dropped
 *     // ... handler body
 *   });
 */
function createSocketRateLimiter({ windowMs, max }) {
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new Error("windowMs must be a positive number");
  }
  if (!Number.isFinite(max) || max <= 0) {
    throw new Error("max must be a positive number");
  }

  const hits = [];

  return function tryHit() {
    const now = Date.now();
    while (hits.length > 0 && now - hits[0] >= windowMs) {
      hits.shift();
    }
    if (hits.length >= max) return false;
    hits.push(now);
    return true;
  };
}

module.exports = { createSocketRateLimiter };
