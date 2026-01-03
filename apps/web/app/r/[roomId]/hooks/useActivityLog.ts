import { useCallback, useEffect, useRef, useState } from "react";
import type {
  SyncData,
  RoomStateData,
  ChatMessage,
  ChatHistoryData,
  ActivityEvent,
  ActivityHistoryData,
} from "shared-logic";
import type { LogEntry } from "../types";
import {
  formatTime,
  mapActivityEventToLog,
  safeToTimeString,
} from "../lib/activity";
import { normalizeVideoUrl } from "../lib/video";
import { getCurrentTimeFromRef, seekToFromRef } from "../lib/player";

interface UseActivityLogProps {
  roomId: string;
  userId: string;
  isConnected: boolean;
  playerRef: React.RefObject<unknown>;
  applyingRemoteSyncRef: React.MutableRefObject<boolean>;
  setUrl: (url: string) => void;
  setInputUrl: (url: string) => void;
  setVideoState: (state: string) => void;
  setMuted: (muted: boolean) => void;
  setVolume: (volume: number) => void;
  setPlaybackRate: (rate: number) => void;
  setAudioSyncEnabled: (enabled: boolean) => void;
  setPlayerReady: (ready: boolean) => void;
  setPlayerError: (error: string | null) => void;
  onSyncEvent: (callback: (data: SyncData) => void) => () => void;
  onRoomState?: (
    callback: (state: RoomStateData) => void
  ) => (() => void) | undefined;
  onChatHistory?: (
    callback: (data: ChatHistoryData) => void
  ) => (() => void) | undefined;
  onChatMessage?: (
    callback: (m: ChatMessage) => void
  ) => (() => void) | undefined;
  onActivityHistory?: (
    callback: (data: ActivityHistoryData) => void
  ) => (() => void) | undefined;
  onActivityEvent?: (
    callback: (e: ActivityEvent) => void
  ) => (() => void) | undefined;
  requestRoomState?: () => void;
  requestChatHistory?: () => void;
  requestActivityHistory?: () => void;
  sendChatMessage?: (text: string) => void;
}

export function useActivityLog({
  roomId,
  userId,
  isConnected,
  playerRef,
  applyingRemoteSyncRef,
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
  const remoteSyncResetTimeoutRef = useRef<number | null>(null);

  const markApplyingRemoteSync = useCallback(() => {
    applyingRemoteSyncRef.current = true;
    if (remoteSyncResetTimeoutRef.current) {
      window.clearTimeout(remoteSyncResetTimeoutRef.current);
    }
    // Give embedded players a moment to emit their own callbacks (onPlay/onSeek/etc)
    // so receivers don't re-broadcast.
    remoteSyncResetTimeoutRef.current = window.setTimeout(() => {
      applyingRemoteSyncRef.current = false;
      remoteSyncResetTimeoutRef.current = null;
    }, 600);
  }, [applyingRemoteSyncRef]);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Handle sync, chat, and activity events
  useEffect(() => {
    const cleanupRoomState = onRoomState?.((state) => {
      if (!state || state.roomId !== roomId) return;

      markApplyingRemoteSync();

      if (state.videoUrl) {
        const nextUrl = normalizeVideoUrl(state.videoUrl);
        setUrl(nextUrl);
        setInputUrl(nextUrl);
      }

      if (typeof state.timestamp === "number" && playerRef.current) {
        const current = getCurrentTimeFromRef(playerRef);
        if (Math.abs(current - state.timestamp) > 1) {
          seekToFromRef(playerRef, state.timestamp);
        }
      }

      if (typeof state.volume === "number" && Number.isFinite(state.volume)) {
        setVolume(Math.max(0, Math.min(1, state.volume)));
      }
      if (typeof state.isMuted === "boolean") {
        setMuted(state.isMuted);
      }
      if (typeof state.audioSyncEnabled === "boolean") {
        setAudioSyncEnabled(state.audioSyncEnabled);
      }
      if (
        typeof state.playbackSpeed === "number" &&
        Number.isFinite(state.playbackSpeed)
      ) {
        setPlaybackRate(state.playbackSpeed);
      }

      if (typeof state.isPlaying === "boolean") {
        setVideoState(state.isPlaying ? "Playing" : "Paused");
      } else {
        if (state.action === "play") setVideoState("Playing");
        if (state.action === "pause") setVideoState("Paused");
      }
    });

    const cleanupChatHistory = onChatHistory?.((data: ChatHistoryData) => {
      if (!data || data.roomId !== roomId || !Array.isArray(data.messages))
        return;

      setLogs((prev) => {
        const existingChatIds = new Set(
          prev
            .filter((l) => l.type === "chat")
            .map((l) => l.id)
            .filter(Boolean)
        );

        const next = [...prev];
        for (const m of data.messages) {
          if (!m?.id || existingChatIds.has(m.id)) continue;
          const t = safeToTimeString(m.createdAt);
          const isSystem = m.senderId === "system";
          const isMe = m.senderId === userId;
          const userDisplay = isSystem
            ? "System"
            : isMe
              ? "You"
              : m.senderUsername || m.senderId || "Unknown";
          next.push({
            id: m.id,
            msg: m.text,
            type: "chat",
            time: t,
            user: userDisplay,
          });
        }
        return next;
      });
    });

    const cleanupChatMessage = onChatMessage?.((m: ChatMessage) => {
      if (!m || m.roomId !== roomId) return;

      const t = safeToTimeString(m.createdAt);
      const isSystem = m.senderId === "system";
      const isMe = m.senderId === userId;
      const userDisplay = isSystem
        ? "System"
        : isMe
          ? "You"
          : m.senderUsername || m.senderId || "Unknown";

      setLogs((prev) => {
        const exists = prev.some((l) => l.id === m.id);
        if (exists) return prev;
        return [
          ...prev,
          { id: m.id, msg: m.text, type: "chat", time: t, user: userDisplay },
        ];
      });
    });

    const cleanupActivityHistory = onActivityHistory?.(
      (data: ActivityHistoryData) => {
        if (!data || data.roomId !== roomId || !Array.isArray(data.events))
          return;

        setLogs((prev) => {
          const existingIds = new Set(prev.map((l) => l.id).filter(Boolean));
          const next = [...prev];

          for (const e of data.events) {
            if (!e?.id || existingIds.has(e.id)) continue;

            const isMe = e.senderId === userId;
            const userDisplay = isMe
              ? "You"
              : e.senderUsername || e.senderId || "Unknown";
            const t = safeToTimeString(e.createdAt);
            const mapped = mapActivityEventToLog(e);
            if (!mapped) continue;

            next.push({
              id: e.id,
              msg: mapped.msg,
              type: mapped.type,
              time: t,
              user: userDisplay,
            });
          }
          return next;
        });
      }
    );

    const cleanupActivityEvent = onActivityEvent?.((e: ActivityEvent) => {
      if (!e || e.roomId !== roomId) return;

      const mapped = mapActivityEventToLog(e);
      if (!mapped) return;

      const isMe = e.senderId === userId;
      const userDisplay = isMe
        ? "You"
        : e.senderUsername || e.senderId || "Unknown";
      const t = safeToTimeString(e.createdAt);

      setLogs((prev) => {
        if (prev.some((l) => l.id === e.id)) return prev;
        return [
          ...prev,
          {
            id: e.id,
            msg: mapped.msg,
            type: mapped.type,
            time: t,
            user: userDisplay,
          },
        ];
      });
    });

    const cleanup = onSyncEvent((data: SyncData) => {
      markApplyingRemoteSync();

      const time = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      const isMe = data.senderId === userId;
      const userDisplay = isMe ? "You" : data.senderId || "Unknown";

      let logMsg = "";
      if (data.action === "play") logMsg = `started playing`;
      if (data.action === "pause") logMsg = `paused the video`;
      if (data.action === "seek")
        logMsg = `jumped to ${formatTime(data.timestamp)}`;
      if (data.action === "change_url") {
        logMsg = data.videoUrl
          ? `changed video source to ${data.videoUrl}`
          : `changed video source`;
        if (data.videoUrl) {
          const nextUrl = normalizeVideoUrl(data.videoUrl);
          setPlayerReady(false);
          setPlayerError(null);
          setUrl(nextUrl);
          setInputUrl(nextUrl);
        }
      }

      if (typeof data.volume === "number" && Number.isFinite(data.volume)) {
        setVolume(Math.max(0, Math.min(1, data.volume)));
      }
      if (typeof data.isMuted === "boolean") {
        setMuted(data.isMuted);
      }
      if (typeof data.audioSyncEnabled === "boolean") {
        setAudioSyncEnabled(data.audioSyncEnabled);
      }
      if (
        typeof data.playbackSpeed === "number" &&
        Number.isFinite(data.playbackSpeed)
      ) {
        setPlaybackRate(data.playbackSpeed);
      }

      if (data.action === "set_audio_sync") {
        logMsg =
          typeof data.audioSyncEnabled === "boolean"
            ? `audio sync: ${data.audioSyncEnabled ? "on" : "off"}`
            : "changed audio sync";
      }

      if (data.action === "set_mute") {
        logMsg =
          typeof data.isMuted === "boolean"
            ? `muted: ${data.isMuted}`
            : "toggled mute";
      }
      if (data.action === "set_volume") {
        logMsg =
          typeof data.volume === "number"
            ? `changed volume to ${Math.round(data.volume * 100)}%`
            : "changed volume";
      }
      if (data.action === "set_speed") {
        logMsg =
          typeof data.playbackSpeed === "number"
            ? `changed speed to ${data.playbackSpeed}x`
            : "changed playback speed";
      }

      setLogs((prev) => [
        ...prev,
        { msg: logMsg, type: data.action, time, user: userDisplay },
      ]);

      if (data.action === "play") setVideoState("Playing");
      if (data.action === "pause") setVideoState("Paused");
      if (data.action === "seek" || data.action === "play") {
        const currentTime = getCurrentTimeFromRef(playerRef);
        if (Math.abs(currentTime - data.timestamp) > 1) {
          seekToFromRef(playerRef, data.timestamp);
        }
      }
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
    };
  }, [
    onSyncEvent,
    onRoomState,
    onChatHistory,
    onChatMessage,
    onActivityHistory,
    onActivityEvent,
    markApplyingRemoteSync,
    roomId,
    userId,
    playerRef,
    applyingRemoteSyncRef,
    setUrl,
    setInputUrl,
    setVideoState,
    setMuted,
    setVolume,
    setPlaybackRate,
    setAudioSyncEnabled,
    setPlayerReady,
    setPlayerError,
  ]);

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
