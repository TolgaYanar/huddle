const express = require("express");
const http = require("http");
const cors = require("cors");
const os = require("os");

require("dotenv").config();

const { vLog, requestId } = require("./src/logging");
const { initSentry } = require("./src/observability/sentry");
const {
  parseAllowedOrigins,
  readBooleanEnv,
  isExtensionOrigin,
  createCorsOptions,
} = require("./src/cors");
const { initPrisma } = require("./src/prisma");
const { securityHeaders } = require("./src/security");

const {
  SESSION_COOKIE_NAME,
  sha256Hex,
  parseCookies,
  setSessionCookie,
  clearSessionCookie,
  createSessionService,
} = require("./src/auth/session");
const { hashPassword, verifyPassword } = require("./src/auth/password");
const {
  validateUsername,
  validatePassword,
  validatePasswordForLogin,
  validateRoomId,
} = require("./src/auth/validators");
const { createRequireAuth } = require("./src/auth/middleware");
const { createSessionCleanup } = require("./src/auth/sessionCleanup");
const { createTelemetryCleanup } = require("./src/telemetry/telemetryCleanup");
const { createHistoryCleanups } = require("./src/shared/historyCleanup");

const { registerRoutes } = require("./src/routes");
const { assertIceReadiness, readIceConfig } = require("./src/webrtc/iceConfig");
const { createCloudflareTurnProvider } = require("./src/webrtc/cloudflareTurn");
const { createIo } = require("./src/socket/createIo");
const { registerSocket } = require("./src/socket/register");

// Before anything else, so a failure during wiring is still reported. A
// missing SENTRY_DSN makes this a no-op.
initSentry();

const app = express();

// Railway puts two proxies in front of the app: its edge, which replaces any
// client-sent X-Forwarded-For with the address that connected to it, and an
// internal hop that appends the edge's own address. Measured 2026-09-29: every
// request arrives as "<connecting address>, <Railway edge>". A hop count of 1
// made req.ip the Railway edge, so every user shared one rate-limit key.
//
// Through the Vercel rewrite the connecting address is Vercel's egress, not the
// user; the user's address is only in x-vercel-forwarded-for, which a direct
// request can forge, so it is not trusted here. src/auth/clientIp.js accepts
// the web proxy's copy of it only alongside PROXY_SHARED_SECRET.
app.set("trust proxy", 2);

const allowExtensionOrigins = readBooleanEnv("ALLOW_EXTENSION_ORIGINS");
const allowedOrigins = parseAllowedOrigins(process.env.CORS_ORIGINS);

const corsOptions = createCorsOptions({
  allowedOrigins,
  allowExtensionOrigins,
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  isProduction: process.env.NODE_ENV === "production",
});

app.disable("x-powered-by");
app.use(requestId());
app.use(securityHeaders());

// TEMPORARY: which forwarding headers reach ICE lookups. Booleans only, no
// addresses. warn, because info is dropped unless VERBOSE_LOGS is set.
app.use("/api/webrtc/ice", (req, res, next) => {
  req.log.warn(
    `[proxy-headers] ${JSON.stringify({
      proxied: req.headers["x-huddle-proxied"] === "1",
      secret: Boolean(req.headers["x-huddle-proxy-secret"]),
      clientIp: Boolean(req.headers["x-huddle-client-ip"]),
      vercelForwardedFor: Boolean(req.headers["x-vercel-forwarded-for"]),
    })}`,
  );
  next();
});

// Lightweight request-duration log line for non-health endpoints.
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    if (req.path === "/health") return;
    const ms = Date.now() - start;
    const line = `${req.method} ${req.path} ${res.statusCode} ${ms}ms`;
    if (res.statusCode >= 500) req.log.error(line);
    else if (res.statusCode >= 400) req.log.warn(line);
    else req.log.info(line);
  });
  next();
});

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
// Telemetry parses its own body with a much tighter limit. Skipping it here
// is what makes that limit real: once this middleware has parsed the body,
// a route-level express.json() sees req.body already set and passes through,
// so the narrower cap would never reject anything.
const TELEMETRY_PATH_PREFIX = "/api/telemetry/";
const globalJson = express.json({ limit: "1mb" });
app.use((req, res, next) => {
  if (req.path.startsWith(TELEMETRY_PATH_PREFIX)) return next();
  return globalJson(req, res, next);
});

if (process.env.NODE_ENV === "production" && allowedOrigins.length === 0) {
  console.warn(
    "[security] CORS_ORIGINS is empty in production — all browser origins will be DENIED (CORS fails closed). Set CORS_ORIGINS to a comma-separated allowlist.",
  );
}

// Relay configuration is read before database clients or cleanup timers start.
// A deployment that opts into REQUIRE_TURN therefore fails without opening
// other resources when its relay settings are missing or malformed.
const iceConfig = readIceConfig(process.env);
for (const warning of iceConfig.warnings) console.warn(`[ice] ${warning}`);
const iceReadiness = assertIceReadiness(iceConfig);
console.log(`[ice] TURN relay mode: ${iceConfig.mode}`);
if (
  process.env.NODE_ENV === "production" &&
  iceReadiness.status === "degraded"
) {
  console.warn(
    "[ice] WebRTC voice is degraded: no TURN relay is configured; strict NAT pairs may be unable to connect",
  );
}

// One provider for the whole process, so /health and the ICE route read the
// same cached credential instead of minting twice.
const cloudflareTurnProvider =
  iceConfig.mode === "cloudflare"
    ? createCloudflareTurnProvider({
        keyId: iceConfig.cloudflareKeyId,
        apiToken: iceConfig.cloudflareApiToken,
        ttlSeconds: iceConfig.ttlSeconds,
        onError: (message) => console.warn(`[ice] cloudflare: ${message}`),
      })
    : null;

const prismaState = initPrisma({ vLog });
const getPrisma = () => prismaState.prisma;
const isDbConnected = () => prismaState.dbConnected;

const session = createSessionService({ getPrisma, isDbConnected });
const requireAuth = createRequireAuth({ getAuthUser: session.getAuthUser });
const sessionCleanup = createSessionCleanup({ getPrisma, isDbConnected, vLog });
sessionCleanup.start();

const telemetryCleanup = createTelemetryCleanup({
  getPrisma,
  isDbConnected,
  vLog,
});
telemetryCleanup.start();

const historyCleanup = createHistoryCleanups({
  getPrisma,
  isDbConnected,
  vLog,
});
historyCleanup.start();

let io;

const deps = {
  vLog,
  iceConfig,
  cloudflareTurnProvider,

  // prisma
  getPrisma,
  isDbConnected,

  // socket
  getIo: () => io,
  allowedOrigins,
  allowExtensionOrigins,
  isExtensionOrigin,

  // auth/session
  SESSION_COOKIE_NAME,
  sha256Hex,
  parseCookies,
  setSessionCookie,
  clearSessionCookie,
  getAuthUser: session.getAuthUser,
  createSessionForUser: session.createSessionForUser,

  // auth/password
  hashPassword,
  verifyPassword,

  // validators
  validateUsername,
  validatePassword,
  validatePasswordForLogin,
  validateRoomId,

  // middleware
  requireAuth,
};

registerRoutes(app, deps);

const server = http.createServer(app);
io = createIo(server, {
  allowedOrigins,
  allowExtensionOrigins,
  isProduction: process.env.NODE_ENV === "production",
  vLog,
});

registerSocket(io, deps);

const PORT = process.env.PORT || 4000;

function getLanIPv4() {
  try {
    const ifaces = os.networkInterfaces();
    for (const list of Object.values(ifaces)) {
      for (const iface of list || []) {
        if (iface && iface.family === "IPv4" && !iface.internal) {
          return iface.address;
        }
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function listen() {
  server.listen(PORT, "0.0.0.0", () => {
    const lanIp = getLanIPv4();
    console.log(`✓ Server running on port ${PORT}`);
    console.log(`✓ Server accessible at http://localhost:${PORT}`);
    if (lanIp) {
      console.log(`✓ Server accessible on LAN at http://${lanIp}:${PORT}`);
    }
    // The pg pool connects lazily, so the startup probe is still in flight
    // here. Reporting isDbConnected() synchronously printed "memory-only mode"
    // even against a healthy database. Wait for the probe, then report.
    void prismaState.ready.then((connected) => {
      console.log(
        `✓ Database status: ${connected ? "Connected" : "Disconnected (running in memory-only mode)"}`,
      );
    });
  });
}

// Cloudflare hands out relay credentials over an API, so a revoked or mistyped
// key is indistinguishable from a working one until it is used. Mint once at
// startup: REQUIRE_TURN promises a startup failure rather than a silent
// downgrade, and that promise can only be kept by actually asking. Without the
// flag the check still runs, but in the background, so a Cloudflare blip never
// delays a boot that is allowed to degrade to STUN.
async function verifyCloudflareCredentials() {
  if (!cloudflareTurnProvider) return true;
  const issued = await cloudflareTurnProvider.getIceServers();
  if (issued) {
    console.log("[ice] cloudflare: relay credential verified");
    return true;
  }
  console.error(
    "[ice] cloudflare: no relay credential could be issued; check CLOUDFLARE_TURN_KEY_ID and CLOUDFLARE_TURN_API_TOKEN",
  );
  return false;
}

if (cloudflareTurnProvider && iceConfig.requireTurn) {
  void verifyCloudflareCredentials().then((ok) => {
    if (ok) return listen();
    console.error(
      "[ice] REQUIRE_TURN is enabled and the relay cannot issue credentials; refusing to start",
    );
    process.exit(1);
  });
} else {
  listen();
  void verifyCloudflareCredentials();
}

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  sessionCleanup.stop();
  telemetryCleanup.stop();
  historyCleanup.stop();
  try {
    const prisma = getPrisma();
    if (prisma) await prisma.$disconnect();
  } finally {
    process.exit(0);
  }
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
