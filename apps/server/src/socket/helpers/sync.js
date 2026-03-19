function emitServerSyncToRoom(io, roomId, payload) {
  io.to(roomId).emit("receive_sync", {
    roomId,
    ...payload,
    senderId: "system",
    senderUsername: "Playlist",
    serverNow: Date.now(),
  });
}

function getEstimatedTimestampForState(state, nowMs) {
  if (!state) return 0;
  const baseTimestamp =
    typeof state.timestamp === "number" && Number.isFinite(state.timestamp)
      ? state.timestamp
      : 0;
  if (state.isPlaying !== true) return baseTimestamp;

  const updatedAtMs =
    typeof state.updatedAt === "number" && Number.isFinite(state.updatedAt)
      ? state.updatedAt
      : nowMs;
  const speed =
    typeof state.playbackSpeed === "number" &&
    Number.isFinite(state.playbackSpeed)
      ? state.playbackSpeed
      : 1;

  return baseTimestamp + Math.max(0, (nowMs - updatedAtMs) / 1000) * speed;
}

function buildRoomStatePayload(roomId, state, nowMs) {
  const estimatedTimestamp = getEstimatedTimestampForState(state, nowMs);
  return {
    roomId,
    serverNow: nowMs,
    ...(state || {}),
    timestamp: estimatedTimestamp,
    // Ensure isPlaying is always defined (default to false if missing)
    isPlaying: state?.isPlaying ?? false,
    rev:
      typeof state?.rev === "number" && Number.isFinite(state.rev)
        ? state.rev
        : 0,
  };
}

function emitRoomStateToRoom(io, state, roomId) {
  const now = Date.now();
  const st = state.roomState.get(roomId);
  io.to(roomId).emit("room_state", buildRoomStatePayload(roomId, st, now));
}

function emitRoomStateToSocket(state, socket, roomId) {
  const now = Date.now();
  const st = state.roomState.get(roomId);
  socket.emit("room_state", buildRoomStatePayload(roomId, st, now));
}

function parseYouTubeTimeToSeconds(timeStr) {
  if (typeof timeStr !== "string" || !timeStr) return 0;
  const trimmed = timeStr.trim();
  if (!trimmed) return 0;

  // Pure seconds
  if (/^\d+$/.test(trimmed)) {
    const n = Number.parseInt(trimmed, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  // 1h2m30s / 2m30s / 30s / 1h30m
  let total = 0;
  const h = trimmed.match(/(\d+)h/i);
  const m = trimmed.match(/(\d+)m/i);
  const s = trimmed.match(/(\d+)s/i);
  if (h?.[1]) total += Number.parseInt(h[1], 10) * 3600;
  if (m?.[1]) total += Number.parseInt(m[1], 10) * 60;
  if (s?.[1]) total += Number.parseInt(s[1], 10);
  return Number.isFinite(total) && total > 0 ? total : 0;
}

function getStartTimeFromVideoUrl(videoUrl) {
  if (typeof videoUrl !== "string" || !videoUrl) return 0;
  try {
    const u = new URL(videoUrl);
    const t = u.searchParams.get("t") || u.searchParams.get("start");
    return parseYouTubeTimeToSeconds(t);
  } catch {
    // Fallback for malformed URLs
    const m = videoUrl.match(/[?&](t|start)=([^&#]+)/i);
    if (m?.[2]) return parseYouTubeTimeToSeconds(m[2]);
    return 0;
  }
}

function applyPlaylistPlaybackToRoomState(io, state, roomId, videoUrl) {
  const prev = state.roomState.get(roomId) || {};
  const now = Date.now();
  const prevUrl = typeof prev.videoUrl === "string" ? prev.videoUrl : null;
  const prevUpdatedAt = typeof prev.updatedAt === "number" ? prev.updatedAt : 0;
  const prevRev =
    typeof prev.rev === "number" && Number.isFinite(prev.rev) ? prev.rev : 0;

  // Guard against accidental restart loops.
  if (
    prevUrl === videoUrl &&
    prev.isPlaying === true &&
    now - prevUpdatedAt < 3000
  ) {
    return;
  }

  const prevSpeed =
    typeof prev.playbackSpeed === "number" &&
    Number.isFinite(prev.playbackSpeed)
      ? prev.playbackSpeed
      : 1;

  const startTimestamp = getStartTimeFromVideoUrl(videoUrl);

  // Broadcast in a receiver-friendly order: change_url -> play.
  const changeRev = prevRev + 1;
  const changeState = {
    ...prev,
    videoUrl,
    timestamp: startTimestamp,
    updatedAt: now,
    playbackSpeed: prevSpeed,
    action: "change_url",
    isPlaying: false,
    rev: changeRev,
    senderId: "system",
    senderUsername: "Playlist",
  };
  state.roomState.set(roomId, changeState);
  emitServerSyncToRoom(io, roomId, {
    action: "change_url",
    timestamp: startTimestamp,
    videoUrl,
    updatedAt: now,
    rev: changeRev,
    volume: changeState.volume,
    isMuted: changeState.isMuted,
    playbackSpeed: changeState.playbackSpeed,
    audioSyncEnabled: changeState.audioSyncEnabled,
  });
  emitRoomStateToRoom(io, state, roomId);

  const playRev = changeRev + 1;
  const playState = {
    ...changeState,
    action: "play",
    isPlaying: true,
    rev: playRev,
    updatedAt: now,
  };
  state.roomState.set(roomId, playState);
  emitServerSyncToRoom(io, roomId, {
    action: "play",
    timestamp: startTimestamp,
    videoUrl,
    updatedAt: now,
    rev: playRev,
    volume: playState.volume,
    isMuted: playState.isMuted,
    playbackSpeed: playState.playbackSpeed,
    audioSyncEnabled: playState.audioSyncEnabled,
  });
  emitRoomStateToRoom(io, state, roomId);
}

// Upsert the current room state to the DB (best-effort, for persistence across restarts).
async function persistRoomState(deps, state, roomId) {
  if (!deps.isDbConnected || !deps.isDbConnected()) return;
  const prisma = deps.getPrisma?.();
  if (!prisma) return;
  const st = state.roomState.get(roomId);
  const pl = state.roomPlaylistActive.get(roomId);
  const name = state.roomName.get(roomId) || null;
  try {
    await prisma.roomState.upsert({
      where: { roomId },
      update: {
        name,
        videoUrl: st?.videoUrl || null,
        timestamp: typeof st?.timestamp === "number" ? st.timestamp : 0,
        isPlaying: st?.isPlaying === true,
        activePlaylistId: pl?.activePlaylistId || null,
        activePlaylistIdx: pl?.currentItemIndex ?? 0,
      },
      create: {
        roomId,
        name,
        videoUrl: st?.videoUrl || null,
        timestamp: typeof st?.timestamp === "number" ? st.timestamp : 0,
        isPlaying: st?.isPlaying === true,
        activePlaylistId: pl?.activePlaylistId || null,
        activePlaylistIdx: pl?.currentItemIndex ?? 0,
      },
    });
  } catch {
    // best effort — never let persistence failures break the handler
  }
}

// Restore room state from DB into in-memory if missing (handles server restarts).
async function restoreRoomStateFromDB(deps, state, roomId) {
  if (!deps.isDbConnected || !deps.isDbConnected()) return;
  const prisma = deps.getPrisma?.();
  if (!prisma) return;
  try {
    const saved = await prisma.roomState.findUnique({ where: { roomId } });
    if (!saved) return;
    if (saved.name && !state.roomName.has(roomId)) {
      state.roomName.set(roomId, saved.name);
    }
    if (saved.videoUrl && !state.roomState.has(roomId)) {
      state.roomState.set(roomId, {
        videoUrl: saved.videoUrl,
        timestamp: saved.timestamp ?? 0,
        // Always restore as paused — the video may be hours ahead in real time.
        isPlaying: false,
        action: "pause",
        updatedAt: Date.now(),
        rev: 1,
      });
    }
    if (saved.activePlaylistId && !state.roomPlaylistActive.has(roomId)) {
      state.roomPlaylistActive.set(roomId, {
        activePlaylistId: saved.activePlaylistId,
        currentItemIndex: saved.activePlaylistIdx ?? 0,
      });
    }
  } catch {
    // best effort
  }
}

module.exports = {
  emitServerSyncToRoom,
  getEstimatedTimestampForState,
  buildRoomStatePayload,
  emitRoomStateToRoom,
  emitRoomStateToSocket,
  applyPlaylistPlaybackToRoomState,
  persistRoomState,
  restoreRoomStateFromDB,
};
