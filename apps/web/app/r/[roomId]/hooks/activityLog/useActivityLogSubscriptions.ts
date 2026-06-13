import { useCallback, useEffect, useRef } from "react";

import type {
  ActivityEvent,
  ActivityHistoryData,
  ChatHistoryData,
  ChatMessage,
  RoomStateData,
  SyncData,
} from "shared-logic";

import type { LogEntry } from "../../types";
import type { RoomPlaybackAnchor, UseActivityLogProps } from "./types";
import { applyChatHistory, applyChatMessage } from "./chatLog";
import { applyActivityEvent, applyActivityHistory } from "./activityLog";
import { handleSyncEvent } from "./syncLog";
import { applyRoomState } from "./roomState";

export function useActivityLogSubscriptions({
  roomId,
  userId,
  socketId,
  playerRef,
  applyingRemoteSyncRef,
  lastUserPauseAtRef,
  hasInitialSyncRef,
  roomPlaybackAnchorRef,
  onRoomPlaybackAnchorUpdated,
  setUrl,
  setInputUrl,
  setVideoState,
  setMuted,
  setVolume,
  setPlaybackRate,
  setAudioSyncEnabled,
  setPlayerReady,
  setPlayerError,
  onSyncEvent,
  onRoomState,
  onChatHistory,
  onChatMessage,
  onChatRateLimited,
  onActivityHistory,
  onActivityEvent,
  requestRoomState,
  setLogs,
}: UseActivityLogProps & {
  setLogs: React.Dispatch<React.SetStateAction<LogEntry[]>>;
}) {
  const remoteSyncResetTimeoutRef = useRef<number | null>(null);
  const lastAppliedRoomRevRef = useRef<number>(0);
  const lastLoggedRevRef = useRef<number>(0);
  const lastResyncRequestAtRef = useRef<number>(0);

  const markApplyingRemoteSync = useCallback(
    (durationMs = 200) => {
      applyingRemoteSyncRef.current = true;
      if (remoteSyncResetTimeoutRef.current) {
        window.clearTimeout(remoteSyncResetTimeoutRef.current);
      }
      // Give embedded players a moment to emit their own callbacks (onPlay/onSeek/etc)
      // so receivers don't re-broadcast.
      remoteSyncResetTimeoutRef.current = window.setTimeout(() => {
        applyingRemoteSyncRef.current = false;
        remoteSyncResetTimeoutRef.current = null;
      }, durationMs);
    },
    [applyingRemoteSyncRef],
  );

  const setRoomPlaybackAnchor = useCallback(
    (next: RoomPlaybackAnchor) => {
      if (!roomPlaybackAnchorRef) return;
      roomPlaybackAnchorRef.current = next;
      onRoomPlaybackAnchorUpdated?.(next);
    },
    [onRoomPlaybackAnchorUpdated, roomPlaybackAnchorRef],
  );

  // Handle sync, chat, and activity events
  useEffect(() => {
    const cleanupRoomState = onRoomState?.((state: RoomStateData) => {
      applyRoomState({
        state,
        roomId,
        socketId,
        playerRef,
        hasInitialSyncRef,
        lastAppliedRoomRevRef,
        markApplyingRemoteSync,
        setRoomPlaybackAnchor,
        setUrl,
        setInputUrl,
        setVideoState,
        setMuted,
        setVolume,
        setPlaybackRate,
        setAudioSyncEnabled,
        lastUserPauseAtRef,
      });
    });

    const cleanupChatHistory = onChatHistory?.((data: ChatHistoryData) => {
      setLogs((prev) => applyChatHistory({ prev, data, roomId, userId }));
    });

    const cleanupChatMessage = onChatMessage?.((m: ChatMessage) => {
      setLogs((prev) => applyChatMessage({ prev, message: m, roomId, userId }));
    });

    // chat_rate_limited is a per-socket signal: the server only emits it to the
    // socket whose message was dropped, so any received event is inherently for
    // this client. Surface it as a transient SYSTEM notice so the dropped
    // message isn't silent.
    const cleanupChatRateLimited = onChatRateLimited?.(
      (data: { roomId: string }) => {
        if (!data || data.roomId !== roomId) return;
        const time = new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });
        setLogs((prev) => [
          ...prev,
          {
            id: `rate-limited-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            msg: "You're sending messages too quickly — wait a moment.",
            type: "notice",
            time,
            user: "System",
          },
        ]);
      },
    );

    const cleanupActivityHistory = onActivityHistory?.(
      (data: ActivityHistoryData) => {
        setLogs((prev) => applyActivityHistory({ prev, data, roomId, userId }));
      },
    );

    const cleanupActivityEvent = onActivityEvent?.((e: ActivityEvent) => {
      setLogs((prev) => applyActivityEvent({ prev, event: e, roomId, userId }));
    });

    const cleanup = onSyncEvent((data: SyncData) => {
      handleSyncEvent({
        data,
        userId,
        setLogs,
        lastAppliedRoomRevRef,
        lastLoggedRevRef,
        lastResyncRequestAtRef,
        requestRoomState,
      });
    });

    return () => {
      cleanup();
      cleanupRoomState?.();
      cleanupChatHistory?.();
      cleanupChatMessage?.();
      cleanupChatRateLimited?.();
      cleanupActivityHistory?.();
      cleanupActivityEvent?.();

      if (remoteSyncResetTimeoutRef.current) {
        window.clearTimeout(remoteSyncResetTimeoutRef.current);
        remoteSyncResetTimeoutRef.current = null;
      }
      applyingRemoteSyncRef.current = false;
      void setPlayerReady;
      void setPlayerError;
    };
  }, [
    onSyncEvent,
    onRoomState,
    onChatHistory,
    onChatMessage,
    onChatRateLimited,
    onActivityHistory,
    onActivityEvent,
    requestRoomState,
    markApplyingRemoteSync,
    setRoomPlaybackAnchor,
    roomId,
    userId,
    socketId,
    playerRef,
    lastUserPauseAtRef,
    hasInitialSyncRef,
    roomPlaybackAnchorRef,
    setUrl,
    setInputUrl,
    setVideoState,
    setMuted,
    setVolume,
    setPlaybackRate,
    setAudioSyncEnabled,
    applyingRemoteSyncRef,
    setLogs,
    setPlayerReady,
    setPlayerError,
  ]);
}
