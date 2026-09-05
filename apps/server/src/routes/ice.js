const crypto = require("node:crypto");

const { createRateLimiter } = require("../auth/rateLimiter");
const { validateRoomId: defaultValidateRoomId } = require("../auth/validators");
const { isRoomMember } = require("../socket/helpers/membership");
const { buildIceResponse, readIceConfig } = require("../webrtc/iceConfig");
const { createCloudflareTurnProvider } = require("../webrtc/cloudflareTurn");

// One request per room join plus a refresh before the one-hour default TTL.
// 120 per 10 minutes per IP leaves room for a household behind one NAT
// reloading rooms, while bounding how many relay credentials one address can
// mint.
const IP_RATE_LIMIT = 120;
const MEMBERSHIP_RATE_LIMIT = 12;

function safeTokenEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function getVerifiedMembership(req, deps) {
  const validateRoomId = deps.validateRoomId ?? defaultValidateRoomId;
  const roomId = validateRoomId(req.query?.roomId);
  const socketId =
    typeof req.query?.socketId === "string" ? req.query.socketId : "";
  const suppliedToken =
    typeof req.headers?.["x-huddle-room-token"] === "string"
      ? req.headers["x-huddle-room-token"]
      : "";
  if (!roomId || !socketId || !suppliedToken) return null;

  const io = deps.getIo?.();
  const socket = io?.sockets?.sockets?.get(socketId);
  if (!socket || !isRoomMember(socket, roomId)) return null;
  const expectedToken = socket.data?.iceAccessByRoom?.get?.(roomId);
  if (!safeTokenEqual(expectedToken, suppliedToken)) return null;
  return { roomId, socketId };
}

// Cloudflare credentials come from a network call, so a failure there must
// degrade to STUN rather than surface as an error: a degraded call still
// connects the easy paths, a 500 connects nothing.
async function resolveIceResponse(config, provider) {
  if (config.mode !== "cloudflare") return buildIceResponse(config);
  const issued = await provider?.getIceServers();
  if (!issued) return buildIceResponse({ ...config, mode: "none" });
  return {
    // Cloudflare returns its own STUN alongside the relay. Keep our configured
    // STUN in front of it: a second, independent reflexive source improves the
    // odds of finding a direct path, which costs no relay quota at all.
    iceServers: [{ urls: config.stunUrls }, ...issued.iceServers],
    ttlSeconds: issued.ttlSeconds,
  };
}

function registerIceRoutes(app, deps = {}) {
  const config = deps.iceConfig ?? readIceConfig(process.env);
  const cloudflareProvider =
    config.mode === "cloudflare"
      ? (deps.cloudflareTurnProvider ??
        createCloudflareTurnProvider({
          keyId: config.cloudflareKeyId,
          apiToken: config.cloudflareApiToken,
          ttlSeconds: config.ttlSeconds,
          onError: (message) =>
            (deps.onCloudflareError ?? console.warn)(
              `[ice] cloudflare: ${message}`,
            ),
        }))
      : null;
  const ipLimiter = createRateLimiter({
    windowMs: 10 * 60 * 1000,
    max: IP_RATE_LIMIT,
  });
  const membershipLimiter = createRateLimiter({
    windowMs: 10 * 60 * 1000,
    max: MEMBERSHIP_RATE_LIMIT,
    keyGenerator: (req) => req.iceMembershipKey ?? "unverified",
  });

  app.get(
    "/api/webrtc/ice",
    ipLimiter,
    (req, res, next) => {
      res.set("Cache-Control", "no-store");
      // STUN addresses are public configuration and remain available to old
      // clients. TURN credentials spend relay quota, so guests receive them
      // only after a successful socket room join issued a private capability.
      if (config.mode === "none") return res.json(buildIceResponse(config));
      const membership = getVerifiedMembership(req, deps);
      if (!membership) {
        return res.status(403).json({ error: "ice_access_required" });
      }
      req.iceMembershipKey = `${membership.socketId}:${membership.roomId}`;
      return next();
    },
    membershipLimiter,
    async (_req, res) => {
      // Express 4 does not catch a rejected promise from an async handler; the
      // request would hang instead of failing. Nothing below is expected to
      // throw, so this only exists to keep that true after a future change.
      try {
        return res.json(await resolveIceResponse(config, cloudflareProvider));
      } catch {
        return res.json(buildIceResponse({ ...config, mode: "none" }));
      }
    },
  );
}

module.exports = {
  IP_RATE_LIMIT,
  resolveIceResponse,
  MEMBERSHIP_RATE_LIMIT,
  getVerifiedMembership,
  registerIceRoutes,
  safeTokenEqual,
};
