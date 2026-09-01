const { createSocketRateLimiter } = require("../helpers/socketRateLimit");
const {
  parseSyncMetric,
  storeSyncMetric,
} = require("../../telemetry/syncMetric");

const MAX_SOCKET_TELEMETRY_BYTES = 16 * 1024;

/**
 * Sync-quality telemetry over the existing socket.
 *
 * The Netflix extension runs inside the Netflix page, so a plain fetch from
 * its content script is bound to netflix.com's origin and is rejected by CORS.
 * Its socket is not: a WebSocket handshake is not subject to CORS, which is
 * why the extension already reaches this server with no host permission at
 * all. Reusing that connection keeps telemetry working without adding a
 * mandatory host permission — Chrome disables an installed extension until the
 * user accepts a new one, and losing installs to collect metrics is a bad
 * trade.
 *
 * The payload goes through exactly the same validator as the HTTP route, so
 * the privacy and bounds guarantees are identical.
 */
function attachTelemetryHandlers(socket, deps) {
  // A client flushes about once a minute. 20 per 5 minutes leaves room for a
  // reconnect storm while bounding what one socket can write.
  const limiter = createSocketRateLimiter({ windowMs: 5 * 60 * 1000, max: 20 });

  socket.on("telemetry_sync", async (payload) => {
    if (!limiter()) return;

    // Match the HTTP endpoint's 16 KB boundary. Socket.IO has already decoded
    // the frame, but this prevents an oversized unexpected field from taking
    // the more expensive validation/storage path.
    let encoded;
    try {
      encoded = JSON.stringify(payload);
    } catch {
      return;
    }
    if (
      !encoded ||
      Buffer.byteLength(encoded, "utf8") > MAX_SOCKET_TELEMETRY_BYTES
    ) {
      return;
    }

    const row = parseSyncMetric(payload);
    if (!row) return;

    if (!deps.isDbConnected()) return;
    const prisma = deps.getPrisma();
    if (!prisma?.syncMetric?.create) return;

    try {
      await storeSyncMetric(prisma, row);
    } catch (err) {
      // Measurement must never surface to the client or affect playback.
      if (typeof deps.vLog === "function") {
        deps.vLog("Failed to store socket sync metric:", err.message);
      }
    }
  });
}

module.exports = { MAX_SOCKET_TELEMETRY_BYTES, attachTelemetryHandlers };
