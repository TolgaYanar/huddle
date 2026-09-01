const express = require("express");

const { createRateLimiter } = require("../auth/rateLimiter");
const { parseSyncMetric, storeSyncMetric } = require("../telemetry/syncMetric");

// The global express.json limit is 1 MB, which is far more than a counter
// summary needs. A tighter limit here means an oversized body is rejected
// before it is parsed rather than after.
const MAX_BODY_BYTES = "16kb";

// A client flushes at most a few times per session. 60 per 10 minutes per IP
// leaves generous headroom for a household behind one NAT while bounding what
// a single address can write.
const IP_RATE_LIMIT = 600;
const SESSION_RATE_LIMIT = 60;

function acceptedRateLimit(_req, res) {
  return res.status(202).json({ accepted: false });
}

function registerTelemetryRoutes(app, { getPrisma, isDbConnected, vLog }) {
  const ipLimiter = createRateLimiter({
    windowMs: 10 * 60 * 1000,
    max: IP_RATE_LIMIT,
    onLimit: acceptedRateLimit,
  });
  const sessionLimiter = createRateLimiter({
    windowMs: 10 * 60 * 1000,
    max: SESSION_RATE_LIMIT,
    keyGenerator: (req) => `${req.body?.source}:${req.body?.sessionId}`,
    onLimit: acceptedRateLimit,
  });

  app.post(
    "/api/telemetry/sync",
    ipLimiter,
    express.json({ limit: MAX_BODY_BYTES }),
    sessionLimiter,
    async (req, res) => {
      // Telemetry must never shape the product. Every failure path below
      // returns 202: the client has no decision to make with the answer, and
      // a retry loop over a measurement would be worse than losing it.
      const row = parseSyncMetric(req.body);
      if (!row) return res.status(202).json({ accepted: false });

      if (!isDbConnected()) return res.status(202).json({ accepted: false });
      const prisma = getPrisma();
      if (!prisma?.syncMetric?.create || !prisma?.syncMetric?.updateMany) {
        return res.status(202).json({ accepted: false });
      }

      try {
        const accepted = await storeSyncMetric(prisma, row);
        return res.status(202).json({ accepted });
      } catch (err) {
        if (typeof vLog === "function") {
          vLog("Failed to store sync metric:", err.message);
        }
        return res.status(202).json({ accepted: false });
      }
    },
  );
}

module.exports = {
  IP_RATE_LIMIT,
  MAX_BODY_BYTES,
  SESSION_RATE_LIMIT,
  registerTelemetryRoutes,
};
