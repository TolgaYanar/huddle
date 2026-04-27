function registerSavedRoomsRoutes(
  app,
  { getPrisma, requireAuth, validateRoomId },
) {
  function logErr(req, msg, err) {
    const log = req.log?.error || console.error;
    log(msg, err);
  }

  app.get("/api/saved-rooms", requireAuth, async (req, res) => {
    try {
      const userId = req.authUser.id;
      const saved = await getPrisma().savedRoom.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: { roomId: true, createdAt: true },
      });
      return res.json({ rooms: saved });
    } catch (err) {
      logErr(req, "/api/saved-rooms failed:", err);
      return res.status(500).json({ error: "server_error" });
    }
  });

  app.post("/api/saved-rooms", requireAuth, async (req, res) => {
    try {
      const userId = req.authUser.id;
      const roomId = validateRoomId(req.body?.roomId);
      if (!roomId) return res.status(400).json({ error: "invalid_roomId" });

      const saved = await getPrisma().savedRoom.upsert({
        where: { userId_roomId: { userId, roomId } },
        update: {},
        create: { userId, roomId },
        select: { roomId: true, createdAt: true },
      });

      return res.json({ room: saved });
    } catch (err) {
      logErr(req, "POST /api/saved-rooms failed:", err);
      return res.status(500).json({ error: "server_error" });
    }
  });

  app.delete("/api/saved-rooms/:roomId", requireAuth, async (req, res) => {
    try {
      const userId = req.authUser.id;
      const roomId = validateRoomId(req.params.roomId);
      if (!roomId) return res.status(400).json({ error: "invalid_roomId" });

      await getPrisma().savedRoom.deleteMany({ where: { userId, roomId } });
      return res.json({ ok: true });
    } catch (err) {
      logErr(req, "DELETE /api/saved-rooms failed:", err);
      return res.status(500).json({ error: "server_error" });
    }
  });
}

module.exports = {
  registerSavedRoomsRoutes,
};
