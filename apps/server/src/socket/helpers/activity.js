async function emitActivityHistory(deps, state, socket, roomId) {
  try {
    // Skip if database is not connected
    if (!deps.isDbConnected() || !deps.getPrisma()) {
      socket.emit("activity_history", { roomId, events: [] });
      return;
    }

    const recent = await deps.getPrisma().roomActivity.findMany({
      where: { roomId },
      orderBy: { createdAt: "desc" },
      take: state.ACTIVITY_HISTORY_LIMIT,
    });

    socket.emit("activity_history", {
      roomId,
      events: recent.reverse().map((e) => ({
        id: e.id,
        roomId: e.roomId,
        kind: e.kind,
        action: e.action,
        timestamp: e.timestamp,
        videoUrl: e.videoUrl,
        senderId: e.senderId,
        senderUsername: e.senderUsername ?? null,
        createdAt: e.createdAt,
      })),
    });
  } catch (err) {
    console.error("Failed to load activity history:", err.message);
    socket.emit("activity_history", { roomId, events: [] });
  }
}

module.exports = {
  emitActivityHistory,
};
