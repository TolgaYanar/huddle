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
  playerRef,
  applyingRemoteSyncRef,
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
  onActivityHistory,
  onActivityEvent,
  requestRoomState,
  setLogs,
}: UseActivityLogProps & {
  setLogs: React.Dispatch<React.SetStateAction<LogEntry[]>>;
}) {
  const remoteSyncResetTimeoutRef = useRef<number | null>(null);
  const lastAppliedRoomRevRef = useRef<number>(0);
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
      });
    });

    const cleanupChatHistory = onChatHistory?.((data: ChatHistoryData) => {
      setLogs((prev) => applyChatHistory({ prev, data, roomId, userId }));
    });

    const cleanupChatMessage = onChatMessage?.((m: ChatMessage) => {
      setLogs((prev) => applyChatMessage({ prev, message: m, roomId, userId }));
    });

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
        lastResyncRequestAtRef,
        requestRoomState,
      });
    });

    return () => {
      cleanup();
      cleanupRoomState?.();
      cleanupChatHistory?.();
      cleanupChatMessage?.();
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
    onActivityHistory,
    onActivityEvent,
    requestRoomState,
    markApplyingRemoteSync,
    setRoomPlaybackAnchor,
    roomId,
    userId,
    playerRef,
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
