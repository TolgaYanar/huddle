const { Server } = require("socket.io");

const { createOriginCheck } = require("../cors");

function createIo(
  server,
  { allowedOrigins, allowExtensionOrigins, isProduction, vLog },
) {
  const io = new Server(server, {
    cors: {
      origin: createOriginCheck({
        allowedOrigins,
        allowExtensionOrigins,
        isProduction,
      }),
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
