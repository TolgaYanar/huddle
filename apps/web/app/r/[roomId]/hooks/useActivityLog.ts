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
  hasInitialSyncRef?: React.MutableRefObject<boolean>;
  roomPlaybackAnchorRef?: React.MutableRefObject<{
    url: string;
    isPlaying: boolean;
    anchorTime: number;
    anchorAt: number;
    playbackRate: number;
  } | null>;
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
    },
    [roomPlaybackAnchorRef]
  );

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Handle sync, chat, and activity events
  useEffect(() => {
    const cleanupRoomState = onRoomState?.((state) => {
      if (!state || state.roomId !== roomId) return;

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

        // If server already extrapolated (serverNow present), use current time as anchor
        // Otherwise use the original updatedAt for local extrapolation
        const serverAlreadyExtrapolated = typeof state.serverNow === "number";
        const anchorAt = serverAlreadyExtrapolated
          ? Date.now()
          : typeof state.updatedAt === "number" &&
              Number.isFinite(state.updatedAt)
            ? state.updatedAt
            : Date.now();

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
      // Delay slightly to let any seek finish.
      if (hasInitialSyncRef && !hasInitialSyncRef.current) {
        window.setTimeout(() => {
          hasInitialSyncRef.current = true;
        }, 600);
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
      console.log(
        "[SYNC] Received sync event:",
        data.action,
        "from:",
        data.senderUsername || data.senderId
      );

      const guardMs =
        data.action === "seek" ? 500 : data.action === "change_url" ? 400 : 200;
      markApplyingRemoteSync(guardMs);

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
        if (data.videoUrl) {
          const nextUrl = normalizeVideoUrl(data.videoUrl);
          setPlayerReady(false);
          setPlayerError(null);
          setUrl(nextUrl);
          setInputUrl(nextUrl);

          // New media source: anchor starts at 0 (play state comes next).
          const prev = roomPlaybackAnchorRef?.current;
          setRoomPlaybackAnchor({
            url: nextUrl,
            isPlaying: false,
            anchorTime: 0,
            anchorAt: Date.now(),
            playbackRate: prev?.playbackRate ?? 1,
          });
        }
      }

      // Some senders include the URL on play events (e.g. change_url + immediate play).
      // Applying it here makes receivers resilient to event ordering.
      if (data.action === "play" && data.videoUrl) {
        const nextUrl = normalizeVideoUrl(data.videoUrl);
        setPlayerReady(false);
        setPlayerError(null);
        setUrl(nextUrl);
        setInputUrl(nextUrl);
      }

      if (typeof data.volume === "number" && Number.isFinite(data.volume)) {
        setVolume(Math.max(0, Math.min(1, data.volume)));
      }
      if (typeof data.isMuted === "boolean") {
        // Only apply unmute if user has interacted with the document,
        // otherwise browser will pause the video due to autoplay policy.
        // Keep video muted to allow playback sync; user can manually unmute.
        if (data.isMuted === false) {
          // Check if we can safely unmute (user has interacted)
          // navigator.userActivation is available in modern browsers
          const canUnmute =
            typeof navigator !== "undefined" &&
            (navigator as { userActivation?: { hasBeenActive?: boolean } })
              .userActivation?.hasBeenActive;
          if (canUnmute) {
            setMuted(false);
          } else {
            console.log(
              "[SYNC] Skipping unmute - user hasn't interacted with page yet"
            );
          }
        } else {
          setMuted(true);
        }
      }
      if (typeof data.audioSyncEnabled === "boolean") {
        setAudioSyncEnabled(data.audioSyncEnabled);
      }
      if (
        typeof data.playbackSpeed === "number" &&
        Number.isFinite(data.playbackSpeed)
      ) {
        setPlaybackRate(data.playbackSpeed);

        const prev = roomPlaybackAnchorRef?.current;
        if (prev) {
          const nextAnchor = {
            ...prev,
            playbackRate: data.playbackSpeed,
          };
          if (typeof data.timestamp === "number") {
            nextAnchor.anchorTime = data.timestamp;
          }
          if (
            typeof data.updatedAt === "number" &&
            Number.isFinite(data.updatedAt)
          ) {
            nextAnchor.anchorAt = data.updatedAt;
          }
          setRoomPlaybackAnchor(nextAnchor);
        }
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

      // Update expected-time anchor for gesture-required resumes.
      {
        const now = Date.now();
        const prev = roomPlaybackAnchorRef?.current;

        const updatedAt =
          typeof data.updatedAt === "number" && Number.isFinite(data.updatedAt)
            ? data.updatedAt
            : now;

        const nextUrl =
          typeof data.videoUrl === "string" && data.videoUrl
            ? normalizeVideoUrl(data.videoUrl)
            : prev?.url;

        if (data.action === "play" && nextUrl) {
          setRoomPlaybackAnchor({
            url: nextUrl,
            isPlaying: true,
            anchorTime: typeof data.timestamp === "number" ? data.timestamp : 0,
            anchorAt: updatedAt,
            playbackRate: prev?.playbackRate ?? 1,
          });
        }

        if (data.action === "pause" && prev) {
          setRoomPlaybackAnchor({
            ...prev,
            isPlaying: false,
            anchorTime:
              typeof data.timestamp === "number"
                ? data.timestamp
                : prev.anchorTime,
            anchorAt: updatedAt,
          });
        }

        if (data.action === "seek" && prev && prev.isPlaying) {
          setRoomPlaybackAnchor({
            ...prev,
            anchorTime:
              typeof data.timestamp === "number"
                ? data.timestamp
                : prev.anchorTime,
            anchorAt: updatedAt,
          });
        }
      }

      if (data.action === "play") {
        console.log("[SYNC] Setting video state to Playing");
        setVideoState("Playing");
      }
      if (data.action === "pause") {
        console.log("[SYNC] Setting video state to Paused");
        setVideoState("Paused");
      }

      // ONLY seek on explicit seek actions, not on play/pause
      if (data.action === "seek") {
        const currentTime = getCurrentTimeFromRef(playerRef);
        const target = data.timestamp;

        // Only seek if significantly out of sync (>2 seconds)
        if (Math.abs(currentTime - target) > 2) {
          seekToFromRef(playerRef, target);
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
    setRoomPlaybackAnchor,
    roomId,
    userId,
    playerRef,
    applyingRemoteSyncRef,
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
