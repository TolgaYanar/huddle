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
  const videoUrl = location.href;

  s.emit("sync_video", {
    roomId,
    action,
    timestamp,
    videoUrl,
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

  const s = state.socket;
  const roomId = state.currentRoomId;
  if (!s || !roomId) return;

  s.emit("sync_video", {
    roomId,
    action: "set_speed",
    timestamp: v.currentTime,
    playbackSpeed,
    videoUrl: location.href,
  });
}
