function registerHealthRoutes(app, { getIo, isDbConnected }) {
  app.get("/health", (req, res) => {
    const io = getIo();
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      database: isDbConnected() ? "connected" : "disconnected",
      socketio: io ? "initialized" : "not initialized",
    });
  });
}

module.exports = {
  registerHealthRoutes,
};
