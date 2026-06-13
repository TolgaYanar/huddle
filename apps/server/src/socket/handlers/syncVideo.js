const { normalizeRoomId } = require("../helpers/chat");
const {
  emitRoomStateToSocket,
  emitRoomStateToRoom,
  persistRoomState,
} = require("../helpers/sync");
const { emitPlaylistStateToRoom } = require("../helpers/playlists");

function attachSyncHandlers(io, state, socket, deps) {
  socket.on("request_room_state", async (rawRoom) => {
    const roomId = normalizeRoomId(rawRoom);
    if (!roomId) return;
    // Clients emit join_room and request_room_state back-to-back, and
    // join_room awaits a DB load before socket.join(). Await any in-flight
    // join for this room, then gate on membership so non-members can't
    // read the playback state of private rooms.
    const pending = socket.data?.pendingJoins?.get(roomId);
    if (pending) await pending.catch(() => {});
    if (!socket.rooms.has(roomId)) return;
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

    // DEDUPE: drop a second identical sync within 250 ms from the same socket.
    // This swallows the double-firings we see from double-taps, racing
    // ExoPlayer state callbacks, and React StrictMode mounts. Per-socket so
    // legitimate near-simultaneous events from different members still flow.
    if (typeof action === "string") {
      const dedupeKey = `${action}|${typeof timestamp === "number" ? timestamp.toFixed(2) : ""}|${typeof videoUrl === "string" ? videoUrl : ""}|${typeof volume === "number" ? volume.toFixed(3) : ""}|${typeof isMuted === "boolean" ? isMuted : ""}|${typeof playbackSpeed === "number" ? playbackSpeed.toFixed(3) : ""}|${typeof audioSyncEnabled === "boolean" ? audioSyncEnabled : ""}`;
      const dedupeBag = (socket.data ||= {});
      const lastSync = dedupeBag.__lastSyncEvent;
      const nowMs = Date.now();
      if (
        lastSync &&
        lastSync.roomId === roomId &&
        lastSync.key === dedupeKey &&
        nowMs - lastSync.at < 250
      ) {
        if (typeof deps.vLog === "function") {
          deps.vLog(
            `Room ${roomId}: Dropping duplicate ${action} from ${socket.id} (${nowMs - lastSync.at}ms apart)`,
          );
        }
        return;
      }
      dedupeBag.__lastSyncEvent = { roomId, key: dedupeKey, at: nowMs };
    }

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

    // GUARD: clients drift (long buffers, backgrounded tabs, sleeping phones)
    // and their `currentTime` lags reality. If we trusted them blindly, a
    // drifted client tapping play/pause would yank the whole room back several
    // seconds. So for play/pause we clamp the resulting room timestamp to the
    // server's estimated-now rather than rejecting outright — the room never
    // moves backwards and the drifted client itself gets snapped forward when
    // they receive the broadcast. `seek` is left alone because seeking back is
    // a legitimate user action.
    let clampedTimestamp = timestamp;
    if (
      (action === "play" || action === "pause") &&
      typeof timestamp === "number" &&
      Number.isFinite(timestamp)
    ) {
      const regression = estimatedNowTimestamp - timestamp;
      // Only clamp when the regression is significant AND playback has been
      // running for a meaningful amount of time — protects against wiping out
      // a legitimate "go back near the start" play.
      if (regression > 3 && estimatedNowTimestamp > 15) {
        if (typeof deps.vLog === "function") {
          deps.vLog(
            `Room ${roomId}: Clamping ${action} at ${timestamp} -> ~${estimatedNowTimestamp.toFixed(1)}s (regression=${regression.toFixed(1)}s)`,
          );
        }
        clampedTimestamp = estimatedNowTimestamp;
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
    const effectiveIncomingTimestamp = hasIncomingTimestamp
      ? clampedTimestamp
      : estimatedNowTimestamp;
    const nextTimestamp = shouldAnchorPlaybackPosition
      ? action === "change_url"
        ? hasIncomingTimestamp
          ? timestamp
          : 0
        : effectiveIncomingTimestamp
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
