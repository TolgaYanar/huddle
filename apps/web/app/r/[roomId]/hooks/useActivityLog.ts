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

function serverTimeToClientTime(
  serverTimeMs: number,
  serverNowMs: number | undefined,
  receivedAtMs: number
): number {
  if (typeof serverNowMs !== "number" || !Number.isFinite(serverNowMs)) {
    return receivedAtMs;
  }
  // Approximate the client/server clock offset at receive time.
  // offset ~= clientNow - serverNow
  const offsetMs = receivedAtMs - serverNowMs;
  return serverTimeMs + offsetMs;
}

interface UseActivityLogProps {
  roomId: string;
  userId: string;
  isConnected: boolean;
  playerRef: React.RefObject<unknown>;
  applyingRemoteSyncRef: React.MutableRefObject<boolean>;
  hasInitialSyncRef?: React.MutableRefObject<boolean>;
  roomPlaybackAnchorRef?: React.MutableRefObject<{
    url: string;
    isPlaying: boolean;
    anchorTime: number;
    anchorAt: number;
    playbackRate: number;
  } | null>;
  onRoomPlaybackAnchorUpdated?: (next: {
    url: string;
    isPlaying: boolean;
    anchorTime: number;
    anchorAt: number;
    playbackRate: number;
  }) => void;
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
    [applyingRemoteSyncRef]
  );

  const setRoomPlaybackAnchor = useCallback(
    (next: {
      url: string;
      isPlaying: boolean;
      anchorTime: number;
      anchorAt: number;
      playbackRate: number;
    }) => {
      if (!roomPlaybackAnchorRef) return;
      roomPlaybackAnchorRef.current = next;
      onRoomPlaybackAnchorUpdated?.(next);
    },
    [onRoomPlaybackAnchorUpdated, roomPlaybackAnchorRef]
  );

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Handle sync, chat, and activity events
  useEffect(() => {
    const cleanupRoomState = onRoomState?.((state) => {
      if (!state || state.roomId !== roomId) return;

      if (typeof state.rev === "number" && Number.isFinite(state.rev)) {
        lastAppliedRoomRevRef.current = Math.max(
          lastAppliedRoomRevRef.current,
          state.rev
        );
      }

      // Room state application may include a seek; give embedded players longer.
      markApplyingRemoteSync(400);

      if (state.videoUrl) {
        const nextUrl = normalizeVideoUrl(state.videoUrl);
        setUrl(nextUrl);
        setInputUrl(nextUrl);

        const t = typeof state.timestamp === "number" ? state.timestamp : 0;
        const rate =
          typeof state.playbackSpeed === "number" &&
          Number.isFinite(state.playbackSpeed)
            ? state.playbackSpeed
            : 1;
        const playing = state.isPlaying === true || state.action === "play";

        const receivedAt = Date.now();

        // If server already extrapolated (serverNow present), use current time as anchor
        // Otherwise use the original updatedAt for local extrapolation
        const serverAlreadyExtrapolated =
          typeof state.serverNow === "number" &&
          Number.isFinite(state.serverNow);
        const anchorAt = serverAlreadyExtrapolated
          ? receivedAt
          : typeof state.updatedAt === "number" &&
              Number.isFinite(state.updatedAt)
            ? serverTimeToClientTime(
                state.updatedAt,
                state.serverNow,
                receivedAt
              )
            : receivedAt;

        setRoomPlaybackAnchor({
          url: nextUrl,
          isPlaying: playing,
          anchorTime: t,
          anchorAt: anchorAt,
          playbackRate: rate,
        });
      }

      if (typeof state.timestamp === "number" && playerRef.current) {
        const current = getCurrentTimeFromRef(playerRef);

        const rate =
          typeof state.playbackSpeed === "number" &&
          Number.isFinite(state.playbackSpeed)
            ? state.playbackSpeed
            : 1;

        let target = state.timestamp;
        // Only extrapolate if server didn't already (serverNow presence indicates server-side extrapolation)
        // For room_state events from join/resync, server calculates estimated position
        // For sync_video events, we need to extrapolate ourselves
        const serverAlreadyExtrapolated = typeof state.serverNow === "number";

        if (!serverAlreadyExtrapolated && state.isPlaying === true) {
          const updatedAt =
            typeof state.updatedAt === "number" &&
            Number.isFinite(state.updatedAt)
              ? state.updatedAt
              : Date.now();
          // Advance by the actual elapsed time since the room state was updated
          // so late joiners land at the live position.
          const elapsed = Math.max(0, (Date.now() - updatedAt) / 1000);
          target = state.timestamp + elapsed * rate;
        }

        // Only seek if significantly out of sync
        if (Math.abs(current - target) > 2) {
          seekToFromRef(playerRef, target);
        }
      }

      // Mark initial sync complete after room state is received.
      // Keep this short so a page reload doesn't "break" controls.
      if (hasInitialSyncRef && !hasInitialSyncRef.current) {
        window.setTimeout(() => {
          hasInitialSyncRef.current = true;
        }, 150);
      }

      if (typeof state.volume === "number" && Number.isFinite(state.volume)) {
        setVolume(Math.max(0, Math.min(1, state.volume)));
      }
      if (typeof state.isMuted === "boolean") {
        // Avoid forcing unmute before user interaction (autoplay policy).
        // Keep playback muted so it can start automatically; user can unmute after interacting.
        if (state.isMuted === false) {
          const canUnmute =
            typeof navigator !== "undefined" &&
            (navigator as { userActivation?: { hasBeenActive?: boolean } })
              .userActivation?.hasBeenActive;
          if (canUnmute) {
            setMuted(false);
          } else {
            setMuted(true);
          }
        } else {
          setMuted(true);
        }
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
      const receivedAt = Date.now();

      if (typeof data.rev === "number" && Number.isFinite(data.rev)) {
        const last = lastAppliedRoomRevRef.current;

        // Drop stale/out-of-order events.
        if (data.rev <= last) {
          return;
        }

        // If there's a gap, we missed at least one event; request a fresh snapshot.
        if (data.rev > last + 1) {
          if (
            requestRoomState &&
            receivedAt - lastResyncRequestAtRef.current > 1000
          ) {
            lastResyncRequestAtRef.current = receivedAt;
            requestRoomState();
          }
          return;
        }

        lastAppliedRoomRevRef.current = data.rev;
      }
      console.log(
        "[SYNC] Received sync event:",
        data.action,
        "from:",
        data.senderUsername || data.senderId
      );
      const time = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      const isMe = data.senderId === userId;
      const userDisplay = isMe
        ? "You"
        : data.senderUsername || data.senderId || "Unknown";

      let logMsg = "";
      if (data.action === "play") logMsg = `started playing`;
      if (data.action === "pause") logMsg = `paused the video`;
      if (data.action === "seek")
        logMsg = `jumped to ${formatTime(data.timestamp)}`;
      if (data.action === "change_url") {
        logMsg = data.videoUrl
          ? `changed video source to ${data.videoUrl}`
          : `changed video source`;
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
    setRoomPlaybackAnchor,
    roomId,
    userId,
    playerRef,
    applyingRemoteSyncRef,
    hasInitialSyncRef,
    roomPlaybackAnchorRef,
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
