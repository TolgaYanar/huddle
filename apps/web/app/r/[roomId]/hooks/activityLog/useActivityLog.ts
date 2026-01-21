import { useEffect, useRef, useState } from "react";

import type { LogEntry } from "../../types";
import type { UseActivityLogProps } from "./types";
import { useActivityLogSubscriptions } from "./useActivityLogSubscriptions";

export function useActivityLog({
  roomId,
  userId,
  isConnected,
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
  requestChatHistory,
  requestActivityHistory,
  sendChatMessage,
}: UseActivityLogProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [chatText, setChatText] = useState("");
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useActivityLogSubscriptions({
    roomId,
    userId,
    isConnected,
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

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    const text = chatText.trim();
    if (!text) return;
    sendChatMessage?.(text);
    setChatText("");
  };

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
    chatText,
    setChatText,
    handleSendChat,
    addLogEntry,
  };
}
