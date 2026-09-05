const { getIceReadiness, readIceConfig } = require("../webrtc/iceConfig");

function registerHealthRoutes(
  app,
  { getIo, isDbConnected, iceConfig, cloudflareTurnProvider },
) {
  app.get("/health", (req, res) => {
    const io = getIo();
    const webrtc = getIceReadiness(
      iceConfig ?? readIceConfig(process.env),
      cloudflareTurnProvider?.getCredentialStatus?.() ?? null,
    );
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      database: isDbConnected() ? "connected" : "disconnected",
      socketio: io ? "initialized" : "not initialized",
      webrtc,
    });
  });
}

module.exports = {
  registerHealthRoutes,
};
