const { Server } = require("socket.io");

function createIo(
  server,
  { allowedOrigins, allowExtensionOrigins, isExtensionOrigin, vLog },
) {
  const io = new Server(server, {
    cors: {
      origin(origin, callback) {
        const normalizedOrigin = String(origin || "")
          .toLowerCase()
          .replace(/\/+$/, "");

        // Allow non-browser clients (no Origin header) like curl/mobile.
        if (!origin) return callback(null, true);

        // Optionally allow browser extension origins (Chrome/Firefox).
        if (allowExtensionOrigins && isExtensionOrigin(origin)) {
          return callback(null, true);
        }
        if (allowedOrigins.length === 0) return callback(null, true);
        return callback(null, allowedOrigins.includes(normalizedOrigin));
      },
      credentials: true,
      methods: ["GET", "POST"],
    },
    // Explicitly set the path
    path: "/socket.io/",
    // Allow both polling and websocket transports
    transports: ["polling", "websocket"],
    // Allow upgrades from polling to websocket
    allowUpgrades: true,
    // Connection timeout configuration for production stability
    pingTimeout: 60000,
    pingInterval: 25000,
    connectTimeout: 45000,
    upgradeTimeout: 10000,
    // Set max HTTP buffer size
    maxHttpBufferSize: 1e6,
    // Allow HTTP long-polling connections
    allowEIO3: true,
  });

  // Log engine upgrade attempts
  io.engine.on("connection_error", (err) => {
    console.error("Socket.IO engine connection error:", {
      message: err.message,
      code: err.code,
      context: err.context,
    });
  });

  io.engine.on("initial_headers", (headers, req) => {
    if (typeof vLog === "function")
      vLog("Socket.IO initial headers for:", req.url);
  });

  return io;
}

module.exports = {
  createIo,
};
