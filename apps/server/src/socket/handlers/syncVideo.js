const { normalizeRoomId } = require("../helpers/chat");
const {
  emitRoomStateToSocket,
  emitRoomStateToRoom,
  persistRoomState,
} = require("../helpers/sync");
const { emitPlaylistStateToRoom } = require("../helpers/playlists");

function attachSyncHandlers(io, state, socket, deps) {
  socket.on("request_room_state", (rawRoom) => {
    const roomId = normalizeRoomId(rawRoom);
    if (!roomId) return;
    // No membership guard here: clients commonly emit join_room and
    // request_room_state back-to-back on connect, and join_room awaits a
    // DB load before socket.join() actually runs. A strict membership
    // check would race against that and silently drop the request.
    // Room state (current video URL + timestamp) is also low-sensitivity;
    // the room password is the real privacy gate for future events.
    emitRoomStateToSocket(state, socket, roomId);
  });

  // Handle video sync events
  socket.on("sync_video", async (data) => {
    const roomId = normalizeRoomId(data);
    if (!roomId) return;
    // Only members of a room may broadcast sync events to it.
    if (!socket.rooms.has(roomId)) return;

    const {
      action,
      timestamp,
      videoUrl,
      volume,
      isMuted,
      playbackSpeed,
      audioSyncEnabled,
    } = data || {};

    if (typeof deps.vLog === "function") {
      deps.vLog(
        `Room ${roomId}: ${action} at ${timestamp} ${videoUrl ? `URL: ${videoUrl}` : ""}`,
      );
    }

    const prev = state.roomState.get(roomId) || {};

    const now = Date.now();
    const prevTimestamp =
      typeof prev.timestamp === "number" ? prev.timestamp : 0;
    const prevUpdatedAt =
      typeof prev.updatedAt === "number" ? prev.updatedAt : now;
    const prevSpeed =
      typeof prev.playbackSpeed === "number" &&
      Number.isFinite(prev.playbackSpeed)
        ? prev.playbackSpeed
        : 1;
    const prevIsPlaying = prev.isPlaying === true;
    const estimatedNowTimestamp = prevIsPlaying
      ? prevTimestamp + Math.max(0, (now - prevUpdatedAt) / 1000) * prevSpeed
      : prevTimestamp;

    // GUARD: Reject play/pause events that would regress playback significantly.
    if (
      (action === "play" || action === "pause" || action === "seek") &&
      typeof timestamp === "number"
    ) {
      const regression = estimatedNowTimestamp - timestamp;

      const joinedAt =
        socket.data &&
        socket.data.roomJoinedAt &&
        typeof socket.data.roomJoinedAt[roomId] === "number"
          ? socket.data.roomJoinedAt[roomId]
          : 0;
      const joinedRecently = joinedAt > 0 && now - joinedAt < 15000;

      if (regression > 10 && estimatedNowTimestamp > 15 && joinedRecently) {
        if (typeof deps.vLog === "function") {
          deps.vLog(
            `Room ${roomId}: Rejecting ${action} at ${timestamp} - would regress from ~${estimatedNowTimestamp.toFixed(1)}s (joinedRecently)`,
          );
        }
        return;
      }
    }

    const senderUsername =
      socket.data?.authUser?.username ||
      state.socketIdToUsername.get(socket.id) ||
      null;

    // If a user manually changes the URL, stop the playlist from immediately overriding them.
    if (action === "change_url") {
      const active = state.roomPlaylistActive.get(roomId);
      if (active?.activePlaylistId && senderUsername !== "Playlist") {
        state.roomPlaylistActive.set(roomId, {
          activePlaylistId: null,
          currentItemIndex: 0,
        });
        try {
          await emitPlaylistStateToRoom(deps, state, io, roomId);
        } catch {
          // best effort
        }
      }
    }

    const shouldAnchorPlaybackPosition =
      action === "play" ||
      action === "pause" ||
      action === "seek" ||
      action === "change_url" ||
      action === "set_speed";

    const hasIncomingTimestamp = typeof timestamp === "number";
    const nextTimestamp = shouldAnchorPlaybackPosition
      ? action === "change_url"
        ? hasIncomingTimestamp
          ? timestamp
          : 0
        : hasIncomingTimestamp
          ? timestamp
          : estimatedNowTimestamp
      : prevTimestamp;

    const nextUpdatedAt = shouldAnchorPlaybackPosition
      ? now
      : typeof prev.updatedAt === "number" && Number.isFinite(prev.updatedAt)
        ? prev.updatedAt
        : now;

    const next = {
      ...prev,
      videoUrl: typeof videoUrl === "string" ? videoUrl : prev.videoUrl,
      timestamp: nextTimestamp,
      action: typeof action === "string" ? action : prev.action,
      updatedAt: nextUpdatedAt,
      senderId: socket.id,
      senderUsername,
    };

    const prevRev =
      typeof prev.rev === "number" && Number.isFinite(prev.rev) ? prev.rev : 0;
    next.rev = prevRev + 1;

    if (typeof volume === "number" && Number.isFinite(volume)) {
      next.volume = Math.max(0, Math.min(1, volume));
    }
    if (typeof isMuted === "boolean") {
      next.isMuted = isMuted;
    }
    if (typeof playbackSpeed === "number" && Number.isFinite(playbackSpeed)) {
      next.playbackSpeed = Math.max(0.25, Math.min(2, playbackSpeed));
    }

    if (typeof audioSyncEnabled === "boolean") {
      next.audioSyncEnabled = audioSyncEnabled;
    }

    if (action === "play") next.isPlaying = true;
    if (action === "pause") next.isPlaying = false;
    if (action === "change_url") next.isPlaying = false;

    state.roomState.set(roomId, next);

    // Persist room state on meaningful actions so it survives server restarts.
    if (action === "change_url" || action === "pause") {
      persistRoomState(deps, state, roomId);
    }

    // Persist this event for activity feed/history.
    try {
      const prisma = deps.getPrisma();
      await prisma.roomActivity.create({
        data: {
          roomId,
          kind: "sync",
          action: action ?? null,
          timestamp: typeof timestamp === "number" ? timestamp : null,
          videoUrl: typeof videoUrl === "string" ? videoUrl : null,
          senderId: socket.id,
          senderUsername,
        },
      });
    } catch (err) {
      console.error("Failed to persist sync activity", err);
    }

    io.to(roomId).emit("receive_sync", {
      roomId,
      action,
      timestamp: next.timestamp,
      videoUrl: next.videoUrl,
      updatedAt: next.updatedAt,
      rev: next.rev,
      volume: next.volume,
      isMuted: next.isMuted,
      playbackSpeed: next.playbackSpeed,
      audioSyncEnabled: next.audioSyncEnabled,
      senderId: socket.id,
      senderUsername,
      serverNow: Date.now(),
    });

    emitRoomStateToRoom(io, state, roomId);
  });
}

module.exports = {
  attachSyncHandlers,
};
