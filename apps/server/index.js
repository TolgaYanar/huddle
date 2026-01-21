const express = require("express");
const http = require("http");
const cors = require("cors");
const os = require("os");

require("dotenv").config();

const { vLog } = require("./src/logging");
const {
  parseAllowedOrigins,
  readBooleanEnv,
  isExtensionOrigin,
  createCorsOptions,
} = require("./src/cors");
const { initPrisma } = require("./src/prisma");

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

const { registerRoutes } = require("./src/routes");
const { createIo } = require("./src/socket/createIo");
const { registerSocket } = require("./src/socket/register");

const app = express();

// Required when running behind Railway/Vercel/other reverse proxies.
// Ensures Express correctly interprets forwarded headers.
app.set("trust proxy", 1);

const allowExtensionOrigins = readBooleanEnv("ALLOW_EXTENSION_ORIGINS");
const allowedOrigins = parseAllowedOrigins(process.env.CORS_ORIGINS);

const corsOptions = createCorsOptions({
  allowedOrigins,
  allowExtensionOrigins,
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
});

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json({ limit: "1mb" }));

const prismaState = initPrisma({ vLog });
const getPrisma = () => prismaState.prisma;
const isDbConnected = () => prismaState.dbConnected;

const session = createSessionService({ getPrisma, isDbConnected });
const requireAuth = createRequireAuth({ getAuthUser: session.getAuthUser });

let io;

const deps = {
  vLog,

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
  isExtensionOrigin,
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

server.listen(PORT, "0.0.0.0", () => {
  const lanIp = getLanIPv4();
  console.log(`✓ Server running on port ${PORT}`);
  console.log(`✓ Server accessible at http://localhost:${PORT}`);
  if (lanIp) {
    console.log(`✓ Server accessible on LAN at http://${lanIp}:${PORT}`);
  }
  console.log(
    `✓ Database status: ${isDbConnected() ? "Connected" : "Disconnected (running in memory-only mode)"}`
  );
});

process.on("SIGINT", async () => {
  try {
    const prisma = getPrisma();
    if (prisma) await prisma.$disconnect();
  } finally {
    process.exit(0);
  }
});
