const { createRateLimiter } = require("../auth/rateLimiter");
const { buildIceResponse, readIceConfig } = require("../webrtc/iceConfig");

// One request per room join plus a refresh every ~19 hours. 120 per 10
// minutes per IP leaves room for a household behind one NAT reloading rooms,
// while bounding how many relay credentials one address can mint.
const IP_RATE_LIMIT = 120;

function registerIceRoutes(app, deps = {}) {
  const config = deps.iceConfig ?? readIceConfig(process.env);
  const ipLimiter = createRateLimiter({
    windowMs: 10 * 60 * 1000,
    max: IP_RATE_LIMIT,
  });

  // Anonymous on purpose: guests join rooms without an account, and a TURN
  // credential is only ever as valuable as its expiry. A 429 or any failure
  // here makes the client fall back to STUN, never to no ICE servers.
  app.get("/api/webrtc/ice", ipLimiter, (_req, res) => {
    res.set("Cache-Control", "no-store");
    return res.json(buildIceResponse(config));
  });
}

module.exports = { IP_RATE_LIMIT, registerIceRoutes };
