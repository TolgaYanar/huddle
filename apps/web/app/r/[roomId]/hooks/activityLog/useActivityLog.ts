import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { LogEntry } from "../../types";
import type { UseActivityLogProps } from "./types";
import { useActivityLogSubscriptions } from "./useActivityLogSubscriptions";

// Upper bound on retained chat + activity entries for one room session.
export const MAX_LOG_ENTRIES = 500;

export function useActivityLog({
  roomId,
  userId,
  socketId,
  isConnected,
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
  requestChatHistory,
  requestActivityHistory,
  sendChatMessage,
  addReactionFn,
  onReactionUpdated,
}: UseActivityLogProps) {
  const [logs, setLogsState] = useState<LogEntry[]>([]);

  // Every append path (chat, activity events, history replays, sync events)
  // funnels through this one setter, so the cap cannot be bypassed by adding
  // another call site. Without it `logs` only ever grew: a three-hour film
  // accumulates thousands of entries, each append re-renders the whole list,
  // and nothing ever releases the memory.
  //
  // Server history is bounded well below this (50 chat + 100 activity), so the
  // cap only ever trims a long live session, never a replay.
  const setLogs = useCallback<Dispatch<SetStateAction<LogEntry[]>>>(
    (action) => {
      setLogsState((prev) => {
        const next = typeof action === "function" ? action(prev) : action;
        // Preserve identity when an updater bails by returning `prev`, so a
        // no-op update still short-circuits the re-render.
        if (next.length <= MAX_LOG_ENTRIES) return next;
        return next.slice(-MAX_LOG_ENTRIES);
      });
    },
    [],
  );
  const [reactions, setReactions] = useState<
    Record<string, Record<string, string[]>>
  >({});
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll is owned by the list component, not this hook.
  //
  // scrollIntoView() here fired on every logs change with no "is the user
  // near the bottom?" check, so scrolling up to re-read history was undone by
  // the next message — which also defeats the windowing control that loads
  // older entries. It scrolls every scrollable ancestor too, so on the stacked
  // mobile layout each incoming message yanked the whole page down to the log.
  // ActivitySidebar has the scroll container and does this conditionally.

  // Subscribe to reaction updates
  useEffect(() => {
    if (!onReactionUpdated) return;
    const cleanup = onReactionUpdated((data) => {
      setReactions((prev) => ({ ...prev, [data.messageId]: data.reactions }));
    });
    return () => cleanup?.();
  }, [onReactionUpdated]);

  useActivityLogSubscriptions({
    roomId,
    userId,
    socketId,
    isConnected,
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
    requestChatHistory,
    requestActivityHistory,
    sendChatMessage,
    setLogs,
  });

  // Request initial data
  useEffect(() => {
    if (!isConnected) return;
    requestRoomState?.();
    requestChatHistory?.();
    requestActivityHistory?.();
  }, [
    isConnected,
    requestRoomState,
    requestChatHistory,
    requestActivityHistory,
  ]);

  // Keep draft text out of this room-level hook. When the draft lived here,
  // every keystroke reran the entire room view-model and all three main
  // columns. Each chat composer now owns its draft and calls this stable,
  // stateless sender only on submit.
  const sendChat = useCallback(
    (value: string) => {
      const text = value.trim();
      if (!text || !sendChatMessage) return false;
      sendChatMessage(text);
      return true;
    },
    [sendChatMessage],
  );

  const addReaction = useCallback(
    (messageId: string, emoji: string) => {
      addReactionFn?.(messageId, emoji);
    },
    [addReactionFn],
  );

  const addLogEntry = (entry: Omit<LogEntry, "time">) => {
    const time = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    setLogs((prev) => [...prev, { ...entry, time }]);
  };

  return {
    logs,
    logsEndRef,
    sendChat,
    addLogEntry,
    reactions,
    addReaction,
  };
}
