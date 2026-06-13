import { io, type Socket } from "socket.io-client";

import { LEGACY_SERVER_URL_KEY } from "./constants";
import { debugLog } from "./log";
import type { ContentState } from "./state";
import type { ExtensionConfig, RoomState } from "./types";
import { normalizeServerUrl } from "./config";
import {
  applyRoomStateToVideo,
  recordPendingRoomState,
  startPlayPausePoll,
  stopPlayPausePoll,
  shouldApplyFollow,
  roomIsOnNetflix,
} from "./playerSync";

export function shouldEmitLocalSync(state: ContentState) {
  return Boolean(state.socket && state.socket.connected && state.currentRoomId);
}

export function emitSync(
  state: ContentState,
  action: string,
  timestamp?: number,
) {
  if (!shouldEmitLocalSync(state)) return;
  const s = state.socket;
  const roomId = state.currentRoomId;
  if (!s || !roomId) return;

  // Stamp what we sent so applyRoomStateToVideo can recognise the echo of
  // our own action when the server pushes the next room_state snapshot.
  // Without this, a local seek would land, the room_state echo would
  // arrive ~200ms later with a slightly-advanced timestamp (because the
  // server extrapolates while isPlaying=true), drift > 1.0s would trigger,
  // and the player would seek to a stale position — the "click multiple
  // times to actually move" symptom.
  state.lastLocalEmitAt = Date.now();
  state.lastLocalEmitAction = action;
  state.lastLocalEmitTimestamp =
    typeof timestamp === "number" ? timestamp : null;

  // Only attach videoUrl on change_url. Attaching it to every play/pause/
  // seek let a Netflix tab overwrite the room's videoUrl for everyone (URL
  // hijack) — the room would jump to whatever this client was watching.
  s.emit("sync_video", {
    roomId,
    action,
    timestamp,
    ...(action === "change_url" && { videoUrl: location.href }),
  });
}

export function connect(
  state: ContentState,
  cfg: ExtensionConfig,
  {
    ensureOverlay,
    updateOverlay,
  }: {
    ensureOverlay: () => void;
    updateOverlay: () => void;
  },
) {
  const serverUrl = normalizeServerUrl(cfg.serverUrl);
  const roomId = cfg.roomId.trim();
  if (!roomId) throw new Error("roomId required");

  disconnect(state, { updateOverlay });

  state.currentRoomId = roomId;
  state.chatMessages = [];
  state.lastRenderedChatSignature = "";
  state.lastAppliedRev = 0;
  state.lastConnectionError = null;

  ensureOverlay();
  updateOverlay();

  state.socket = io(serverUrl, {
    transports: ["websocket", "polling"],
    autoConnect: true,
    withCredentials: true,
    path: "/socket.io/",
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    timeout: 20000,
  });

  const socket = state.socket;

  socket.on("connect", () => {
    state.localSenderId = socket?.id || null;
    state.lastConnectionError = null;
    // NOTE: we deliberately do NOT reset hasAppliedRoomStateSinceConnect
    // here. createInitialState seeds it false, so a genuine fresh content-
    // script load (user navigated Browse -> new /watch title, script
    // re-inits) still starts false and correctly leads via Case A. A mere
    // socket reconnect on the SAME page keeps the flag true and correctly
    // FOLLOWS the room (Case B) — resetting it here used to yank the whole
    // room to this client's title on every transient reconnect.

    socket?.emit("join_room", { roomId });
    socket?.emit("request_room_state", roomId);
    socket?.emit("request_chat_history", roomId);

    startPlayPausePoll(state, {
      emitSync: (action, ts) => emitSync(state, action, ts),
      shouldEmitLocalSync: () => shouldEmitLocalSync(state),
    });

    updateOverlay();
  });

  socket.on("connect_error", (err: any) => {
    state.lastConnectionError = String(err?.message || err || "connect_error");
    debugLog("connect_error", state.lastConnectionError);
    updateOverlay();
  });

  socket.on("disconnect", (reason: string) => {
    debugLog("disconnected", reason);
    state.localSenderId = null;
    updateOverlay();
  });

  socket.on("room_state", (roomState: RoomState) => {
    if (!roomState || roomState.roomId !== state.currentRoomId) return;
    recordPendingRoomState(state, roomState);
    updateOverlay();
    if (shouldApplyFollow()) {
      applyRoomStateToVideo(
        state,
        roomState,
        {
          updateOverlay,
        },
        undefined,
      );
    }
  });

  // `receive_sync` is the server's instant broadcast on every play/pause/seek
  // from any room member. The website's web client listens to this for
  // sub-100ms reaction; we previously didn't, which is why seeks felt sticky:
  // we'd send our own seek, the server would broadcast it back via
  // receive_sync (ignored), and only the much-later `room_state` snapshot
  // would arrive — by which point applyRoomStateToVideo's drift correction
  // would re-seek us to a stale position. Symptom was "I need to click the
  // scrubber multiple times to actually move."
  socket.on(
    "receive_sync",
    (payload: {
      roomId: string;
      action: string;
      timestamp?: number;
      videoUrl?: string;
      updatedAt?: number;
      rev?: number;
      volume?: number;
      isMuted?: boolean;
      playbackSpeed?: number;
      audioSyncEnabled?: boolean;
      senderId?: string;
      senderUsername?: string;
      serverNow?: number;
    }) => {
      if (!payload || payload.roomId !== state.currentRoomId) return;

      // Skip our own echo. The server fans receive_sync to ALL room members
      // including the sender; without this guard a local seek would be
      // applied back onto the video that just performed it, and the second-
      // pass apply could land somewhere slightly different than where the
      // user clicked (because of NetflixWebPlayer's `drift > 1.0` re-seek).
      if (payload.senderId && payload.senderId === state.localSenderId) return;

      // receive_sync mostly carries the same fields as room_state, just
      // without the full snapshot context. Synthesize a RoomState-shaped
      // object and run it through applyRoomStateToVideo so we reuse all the
      // existing apply-logic (drift threshold, play/pause gating, etc.).
      // We rebuild isPlaying from the action because receive_sync doesn't
      // include it explicitly.
      const inferredIsPlaying =
        payload.action === "play"
          ? true
          : payload.action === "pause"
            ? false
            : undefined;

      const pseudoRoomState: RoomState = {
        roomId: payload.roomId,
        timestamp: payload.timestamp,
        videoUrl: payload.videoUrl,
        updatedAt: payload.updatedAt,
        rev: payload.rev,
        volume: payload.volume,
        isMuted: payload.isMuted,
        playbackSpeed: payload.playbackSpeed,
        // Only set isPlaying if the action implies it; leave undefined for
        // set_volume / set_speed / etc. so applyRoomStateToVideo doesn't
        // toggle playback as a side effect.
        ...(inferredIsPlaying !== undefined && { isPlaying: inferredIsPlaying }),
        serverNow: payload.serverNow,
      };

      recordPendingRoomState(state, pseudoRoomState);
      updateOverlay();
      if (shouldApplyFollow()) {
        applyRoomStateToVideo(
          state,
          pseudoRoomState,
          { updateOverlay },
          undefined,
        );
      }
    },
  );

  // Membership updates. Fired every time someone joins or leaves the room,
  // plus once on join with the current snapshot. We keep just enough state
  // to render the "X people watching" indicator in the popup.
  socket.on(
    "room_users",
    (payload: {
      roomId: string;
      users?: string[];
      usernames?: Record<string, string | null>;
      hostId?: string | null;
    }) => {
      if (!payload || payload.roomId !== state.currentRoomId) return;
      const ids = Array.isArray(payload.users) ? payload.users : [];
      state.roomMembers = ids.map((socketId) => ({
        socketId,
        username: payload.usernames?.[socketId] ?? null,
      }));
      state.hostId = payload.hostId ?? null;
      updateOverlay();
    },
  );

  socket.on("chat_history", (payload: any) => {
    if (!payload || payload.roomId !== state.currentRoomId) return;
    const msgs = Array.isArray(payload.messages) ? payload.messages : [];
    state.chatMessages = msgs
      .filter((m: any) => m && typeof m.text === "string")
      .map((m: any) => ({
        id: m.id,
        roomId: m.roomId,
        senderId: m.senderId,
        senderUsername: m.senderUsername ?? null,
        text: m.text,
        createdAt: m.createdAt,
      }));
    state.lastRenderedChatSignature = "";
    updateOverlay();
  });

  socket.on("chat_message", (m: any) => {
    if (!m || m.roomId !== state.currentRoomId || typeof m.text !== "string")
      return;
    state.chatMessages = [
      ...state.chatMessages,
      {
        id: m.id,
        roomId: m.roomId,
        senderId: m.senderId,
        senderUsername: m.senderUsername ?? null,
        text: m.text,
        createdAt: m.createdAt,
      },
    ];
    if (state.chatMessages.length > 200)
      state.chatMessages = state.chatMessages.slice(-200);
    state.lastRenderedChatSignature = "";
    updateOverlay();
  });

  // Clean up any legacy stored server URL from older builds.
  chrome.storage.local.remove([LEGACY_SERVER_URL_KEY]);
}

export function disconnect(
  state: ContentState,
  {
    updateOverlay,
  }: {
    updateOverlay: () => void;
  },
) {
  if (state.socket) {
    try {
      state.socket.removeAllListeners();
      state.socket.disconnect();
    } catch {
      // ignore
    }
  }

  state.socket = null;
  state.currentRoomId = null;
  state.localSenderId = null;
  state.lastConnectionError = null;
  state.chatMessages = [];
  state.lastRenderedChatSignature = "";

  stopPlayPausePoll(state);
  updateOverlay();
}

export function setPlaybackSpeed(state: ContentState, playbackSpeed: number) {
  const v = state.listenersAttachedTo;
  if (!v) return;

  if (state.isApplyingRemote) return;
  if (!shouldEmitLocalSync(state)) return;
  // Don't inject local speed changes into a room that isn't on Netflix.
  if (!roomIsOnNetflix(state)) return;

  const s = state.socket;
  const roomId = state.currentRoomId;
  if (!s || !roomId) return;

  // No videoUrl on set_speed: it isn't a navigation, so attaching the local
  // href would hijack the room's videoUrl (see emitSync).
  s.emit("sync_video", {
    roomId,
    action: "set_speed",
    timestamp: v.currentTime,
    playbackSpeed,
  });
}
