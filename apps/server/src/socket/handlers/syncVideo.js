const { normalizeRoomId } = require("../helpers/chat");
const {
  emitRoomStateToSocket,
  emitRoomStateToRoom,
  persistRoomState,
  getEstimatedTimestampForState,
} = require("../helpers/sync");
const { emitPlaylistStateToRoom } = require("../helpers/playlists");
const { createSocketRateLimiter } = require("../helpers/socketRateLimit");

// A change_url payload IS the URL; nothing legitimate approaches this length.
// An overlong URL is invalid, so we drop the event rather than store garbage.
const MAX_VIDEO_URL_LENGTH = 2048;

// Exhaustive set of sync actions any real client (web SyncAction type,
// Android SyncAction enum, extension emit literals) or the server's own
// playlist emitter ever sends. Anything outside this set is dropped — a
// rogue/buggy client cannot drive the room with an unknown action.
const ALLOWED_SYNC_ACTIONS = new Set([
  "play",
  "pause",
  "seek",
  "change_url",
  "set_speed",
  "set_volume",
  "set_mute",
  "set_audio_sync",
]);

function attachSyncHandlers(io, state, socket, deps) {
  // One per-socket sync bucket: ~20 events/sec. A real client emits ~2/sec
  // (the 500ms poll plus occasional seeks), so this is generous for honest
  // use but bounds an echo-loop or malicious flood. A dropped event is
  // self-healing: the next accepted event re-broadcasts room_state, which
  // snaps any client that was racing the limiter back into alignment.
  const syncLimiter = createSocketRateLimiter({ windowMs: 2000, max: 40 });

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

    // ALLOWLIST: reject any action no real client emits. Defends against a
    // rogue/buggy client poisoning room state with an unknown action.
    if (typeof action !== "string" || !ALLOWED_SYNC_ACTIONS.has(action)) {
      if (typeof deps.vLog === "function") {
        deps.vLog(
          `Room ${roomId}: Dropping disallowed sync action ${JSON.stringify(action)} from ${socket.id}`,
        );
      }
      return;
    }

    // URL CAP: a change_url payload is the URL itself. Reject an overlong one
    // outright — it can't be a valid video URL and would only bloat state/DB.
    // (Non-change_url actions ignore videoUrl per the Phase-2 guard below.)
    if (
      action === "change_url" &&
      typeof videoUrl === "string" &&
      videoUrl.length > MAX_VIDEO_URL_LENGTH
    ) {
      if (typeof deps.vLog === "function") {
        deps.vLog(
          `Room ${roomId}: Dropping change_url with overlong videoUrl (${videoUrl.length} chars) from ${socket.id}`,
        );
      }
      return;
    }

    // RATE LIMIT: bound the sync hot-path per socket. Dropped here before any
    // state mutation/broadcast. Self-healing — the next accepted event from
    // any member re-broadcasts room_state, snapping this client back in line.
    if (!syncLimiter()) {
      if (typeof deps.vLog === "function") {
        deps.vLog(
          `Room ${roomId}: Rate-limiting sync_video ${action} from ${socket.id}`,
        );
      }
      return;
    }

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
    // Use the shared estimator so the regression clamp below benefits from the
    // same MAX_EXTRAPOLATION_MS cap as room_state — a stale "playing" room
    // can't produce an absurd estimate that traps a late joiner.
    const estimatedNowTimestamp = getEstimatedTimestampForState(prev, now);

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
      // Only change_url may set the room URL. Older extension builds attach
      // their tab's URL to every play/pause/seek, which would let one member
      // hijack the room's video — keep prev.videoUrl for all other actions.
      videoUrl:
        action === "change_url" && typeof videoUrl === "string"
          ? videoUrl
          : prev.videoUrl,
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

    // Capture the activity-row inputs into stable locals BEFORE we emit, so the
    // fire-and-forget insert below reads the values at this point in time even
    // though it runs after the broadcast (and after later events may mutate
    // shared state). senderId mirrors the prior `socket.id`.
    const activityAction = action ?? null;
    const activityTimestamp = typeof timestamp === "number" ? timestamp : null;
    const activityVideoUrl = typeof videoUrl === "string" ? videoUrl : null;
    const activitySenderId = socket.id;
    const activitySenderUsername = senderUsername;

    // Emit FIRST so clients react immediately — the activity-feed persist is a
    // best-effort DB write and must not add a round-trip to the sync hot-path.
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

    // Persist this event for activity feed/history — fire-and-forget. The
    // broadcast above already happened, so a slow/failing DB never delays sync.
    try {
      const prisma = deps.getPrisma();
      prisma.roomActivity
        .create({
          data: {
            roomId,
            kind: "sync",
            action: activityAction,
            timestamp: activityTimestamp,
            videoUrl: activityVideoUrl,
            senderId: activitySenderId,
            senderUsername: activitySenderUsername,
          },
        })
        .catch((err) => {
          console.error("Failed to persist sync activity", err);
        });
    } catch (err) {
      // getPrisma() itself threw (DB unavailable); best-effort, swallow.
      console.error("Failed to persist sync activity", err);
    }
  });
}

module.exports = {
  attachSyncHandlers,
};
