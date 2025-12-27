"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  useRoom,
  SyncData,
  ChatMessage,
  ChatHistoryData,
  ActivityEvent,
  ActivityHistoryData,
  WebRTCMediaState,
  WheelSpunData,
} from "shared-logic";
import { CallSidebar } from "./components/CallSidebar";
import { ActivitySidebar } from "./components/ActivitySidebar";
import { PlayerSection } from "./components/PlayerSection";
import { WheelPickerModal } from "./components/WheelPickerModal";
import { DraggedTilePayload } from "./lib/dnd";

import {
  capitalize,
  formatTime,
  mapActivityEventToLog,
  safeToTimeString,
} from "./lib/activity";
import {
  getKickEmbedSrc,
  getLoadTimeoutMs,
  getPrimeVideoMessage,
  getTimeoutErrorMessage,
  getTwitchEmbedSrc,
  isPrimeVideoUrl,
  isProblematicYoutubeUrl,
  normalizeVideoUrl,
} from "./lib/video";

import { usePushToTalkBinding } from "./hooks/usePushToTalkBinding";
import { useWebRTCPeers } from "./hooks/useWebRTCPeers";

export default function RoomClient({ roomId }: { roomId: string }) {
  type LogEntry = {
    id?: string;
    msg: string;
    type: string;
    time: string;
    user: string;
  };

  const [userId, setUserId] = useState("");
  const logsEndRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<HTMLVideoElement | null>(null);
  const loadTimeoutRef = useRef<number | null>(null);

  const {
    isConnected,
    joinRoom,
    setRoomPassword,
    requestWheelState,
    addWheelEntry,
    removeWheelEntry,
    clearWheelEntries,
    spinWheel,
    onWheelState,
    onWheelSpun,
    sendSyncEvent,
    onSyncEvent,
    onRoomState,
    requestRoomState,
    sendChatMessage,
    onChatMessage,
    onChatHistory,
    requestChatHistory,
    onActivityEvent,
    onActivityHistory,
    requestActivityHistory,
    onRoomUsers,
    onRoomPasswordStatus,
    onRoomPasswordRequired,
    onUserJoined,
    onUserLeft,
    sendWebRTCOffer,
    sendWebRTCAnswer,
    sendWebRTCIce,
    onWebRTCOffer,
    onWebRTCAnswer,
    onWebRTCIce,
    sendWebRTCMediaState,
    onWebRTCMediaState,
    sendWebRTCSpeaking,
    onWebRTCSpeaking,
    socket,
  } = useRoom(roomId, userId);

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [videoState, setVideoState] = useState("Paused");
  const [url, setUrl] = useState(
    "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4"
  );
  const [inputUrl, setInputUrl] = useState(url);
  const [isClient, setIsClient] = useState(false);
  const [muted, setMuted] = useState(true);
  const [playerReady, setPlayerReady] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [isBuffering, setIsBuffering] = useState(false);
  const [copied, setCopied] = useState(false);
  const [chatText, setChatText] = useState("");
  const [hostId, setHostId] = useState<string | null>(null);
  const [roomAccessError, setRoomAccessError] = useState<string | null>(null);
  const [hasRoomPassword, setHasRoomPassword] = useState(false);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const lastSubmittedPasswordRef = useRef<string | null>(null);

  const localStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const micTrackRef = useRef<MediaStreamTrack | null>(null);
  const camTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);

  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const [remoteStreams, setRemoteStreams] = useState<
    Array<{ id: string; stream: MediaStream }>
  >([]);

  const [micEnabled, setMicEnabled] = useState(false);
  const [camEnabled, setCamEnabled] = useState(false);
  const [screenEnabled, setScreenEnabled] = useState(false);
  const [pushToTalkEnabled, setPushToTalkEnabled] = useState(false);
  const {
    bindingLabel: pushToTalkBindingLabel,
    isRebinding: isRebindingPushToTalkKey,
    setIsRebinding: setIsRebindingPushToTalkKey,
    isDown: pushToTalkDown,
    isDownRef: pushToTalkDownRef,
    stopTransmit: stopPushToTalkTransmit,
  } = usePushToTalkBinding({
    isClient,
    enabled: pushToTalkEnabled,
    micEnabled,
  });
  const [echoCancellationEnabled, setEchoCancellationEnabled] = useState(true);
  const [noiseSuppressionEnabled, setNoiseSuppressionEnabled] = useState(true);
  const [autoGainControlEnabled, setAutoGainControlEnabled] = useState(true);
  const [localSpeaking, setLocalSpeaking] = useState(false);
  const [micTrackVersion, setMicTrackVersion] = useState(0);
  const [, setCamTrackVersion] = useState(0);
  const [remoteSpeaking, setRemoteSpeaking] = useState<Record<string, boolean>>(
    {}
  );
  const [remoteMedia, setRemoteMedia] = useState<
    Record<string, WebRTCMediaState>
  >({});
  const [participants, setParticipants] = useState<string[]>([]);

  const [wheelEntries, setWheelEntries] = useState<string[]>([]);
  const [wheelLastSpin, setWheelLastSpin] = useState<WheelSpunData | null>(
    null
  );
  const [isWheelOpen, setIsWheelOpen] = useState(false);

  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const [isPlayerFullscreen, setIsPlayerFullscreen] = useState(false);
  const [fullscreenChatOpen, setFullscreenChatOpen] = useState(false);

  const screenStageContainerRef = useRef<HTMLDivElement | null>(null);
  const [isScreenFullscreen, setIsScreenFullscreen] = useState(false);

  const [pinnedStage, setPinnedStage] = useState<DraggedTilePayload | null>(
    null
  );
  const [isStageDragOver, setIsStageDragOver] = useState(false);
  const [isDraggingTile, setIsDraggingTile] = useState(false);

  const [isCallCollapsed, setIsCallCollapsed] = useState(false);
  const [isActivityCollapsed, setIsActivityCollapsed] = useState(false);

  useEffect(() => {
    if (!isClient) return;
    const onFsChange = () => {
      const fsEl = document.fullscreenElement;
      setIsScreenFullscreen(
        Boolean(fsEl && fsEl === screenStageContainerRef.current)
      );
      setIsPlayerFullscreen(
        Boolean(fsEl && fsEl === playerContainerRef.current)
      );
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
    };
  }, [isClient]);

  useEffect(() => {
    if (!isPlayerFullscreen) {
      setFullscreenChatOpen(false);
    }
  }, [isPlayerFullscreen]);

  const toggleScreenFullscreen = async () => {
    if (!isClient) return;
    const el = screenStageContainerRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await el.requestFullscreen();
      }
    } catch {
      // ignore
    }
  };

  const togglePlayerFullscreen = async () => {
    if (!isClient) return;
    const el = playerContainerRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await el.requestFullscreen();
      }
    } catch {
      // ignore
    }
  };

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadRafRef = useRef<number | null>(null);
  const lastVoiceAtRef = useRef<number>(0);
  const lastSpeakingRef = useRef<boolean>(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Track the room host (minimal moderation primitive).
  useEffect(() => {
    if (!onRoomUsers) return;
    const cleanup = onRoomUsers((data) => {
      if (data.roomId !== roomId) return;
      const nextHost = (data as unknown as { hostId?: string | null }).hostId;
      if (typeof nextHost !== "undefined") {
        setHostId(nextHost ?? null);
      }

      if (Array.isArray(data.users)) {
        setParticipants(
          Array.from(new Set(data.users.filter((id) => id && id !== userId)))
        );
      }

      // If we got room_users, we're successfully in the room.
      setPasswordRequired(false);
      setPasswordError(null);

      // If the user just entered a password and join succeeded, cache it for this tab.
      const submitted = lastSubmittedPasswordRef.current;
      if (submitted) {
        try {
          window.sessionStorage.setItem(
            `huddle:roomPassword:${roomId}`,
            submitted
          );
        } catch {
          // ignore
        }
        lastSubmittedPasswordRef.current = null;
      }
    });
    return () => {
      (cleanup as (() => void) | undefined)?.();
    };
  }, [onRoomUsers, roomId, userId]);

  // Wheel picker state (shared among all participants).
  useEffect(() => {
    const cleanups: Array<() => void> = [];

    if (onWheelState) {
      const off = onWheelState((data) => {
        if (!data || data.roomId !== roomId) return;
        setWheelEntries(Array.isArray(data.entries) ? data.entries : []);

        const last = (data as unknown as { lastSpin?: WheelSpunData | null })
          .lastSpin;
        if (last && typeof last === "object") {
          setWheelLastSpin({ ...last, roomId });
        }
      });
      if (typeof off === "function") cleanups.push(off);
    }

    if (onWheelSpun) {
      const off = onWheelSpun((data) => {
        if (!data || data.roomId !== roomId) return;
        setWheelLastSpin(data);
      });
      if (typeof off === "function") cleanups.push(off);
    }

    // Best effort: ask for a snapshot (server also emits on join).
    requestWheelState?.();

    return () => {
      cleanups.forEach((fn) => {
        try {
          fn();
        } catch {
          // ignore
        }
      });
    };
  }, [onWheelState, onWheelSpun, requestWheelState, roomId]);

  // Password status + required events.
  useEffect(() => {
    const cleanupStatus = onRoomPasswordStatus?.((data) => {
      if (data.roomId !== roomId) return;
      setHasRoomPassword(!!data.hasPassword);
      // If we received a status, join succeeded.
      setPasswordRequired(false);
      setPasswordError(null);
    });

    const cleanupRequired = onRoomPasswordRequired?.((data) => {
      if (data.roomId !== roomId) return;
      setPasswordRequired(true);
      setPasswordError(
        data.reason === "invalid"
          ? "Wrong password. Try again."
          : "This room requires a password."
      );

      // If the stored password is wrong, clear it so we don't auto-retry forever.
      if (data.reason === "invalid") {
        try {
          window.sessionStorage.removeItem(`huddle:roomPassword:${roomId}`);
        } catch {
          // ignore
        }
      }
    });

    return () => {
      (cleanupStatus as (() => void) | undefined)?.();
      (cleanupRequired as (() => void) | undefined)?.();
    };
  }, [onRoomPasswordStatus, onRoomPasswordRequired, roomId]);

  // Keep participant list updated after initial room_users.
  useEffect(() => {
    const cleanupJoined = onUserJoined?.((peerId) => {
      if (!peerId) return;
      if (peerId === userId) return;
      setParticipants((prev) => Array.from(new Set([...prev, peerId])));
    });
    const cleanupLeft = onUserLeft?.((peerId) => {
      if (!peerId) return;
      setParticipants((prev) => prev.filter((id) => id !== peerId));
    });
    return () => {
      (cleanupJoined as (() => void) | undefined)?.();
      (cleanupLeft as (() => void) | undefined)?.();
    };
  }, [onUserJoined, onUserLeft, userId]);

  useEffect(() => {
    if (!socket) return;
    const onHost = (data: { roomId: string; hostId?: string | null }) => {
      if (data.roomId !== roomId) return;
      setHostId(data.hostId ?? null);
    };

    const onBanned = (data: { roomId: string }) => {
      if (data.roomId !== roomId) return;
      setRoomAccessError("You no longer have access to this room.");
      try {
        socket.disconnect();
      } catch {
        // ignore
      }
    };

    socket.on("room_host", onHost);
    socket.on("room_banned", onBanned);

    return () => {
      socket.off("room_host", onHost);
      socket.off("room_banned", onBanned);
    };
  }, [socket, roomId]);

  const ensureLocalStream = () => {
    if (localStreamRef.current) return localStreamRef.current;
    if (typeof window === "undefined") return null;
    if (typeof MediaStream === "undefined") return null;
    localStreamRef.current = new MediaStream();
    return localStreamRef.current;
  };

  const { closeAllPeers, renegotiateAllPeers } =
    useWebRTCPeers<WebRTCMediaState>({
      isConnected,
      userId,
      roomId,
      ensureLocalStream,
      peersRef,
      remoteStreamsRef,
      setRemoteStreams,
      setRemoteMedia,
      setRemoteSpeaking,
      sendWebRTCIce,
      sendWebRTCOffer,
      sendWebRTCAnswer,
      onRoomUsers,
      onUserJoined,
      onUserLeft,
      onWebRTCOffer,
      onWebRTCAnswer,
      onWebRTCIce,
      onWebRTCMediaState,
      onWebRTCSpeaking,
    });

  const kickUser = (targetId: string) => {
    if (!socket) return;
    if (!socket.connected) return;
    socket.emit("kick_user", { roomId, targetId });
  };

  // If the pinned remote user leaves, unpin.
  useEffect(() => {
    if (!pinnedStage) return;
    if (pinnedStage.kind !== "remote") return;
    const stillThere = remoteStreams.some((s) => s.id === pinnedStage.peerId);
    if (!stillThere) setPinnedStage(null);
  }, [pinnedStage, remoteStreams]);

  const stageView = useMemo(() => {
    if (pinnedStage) {
      if (pinnedStage.kind === "local") {
        const s = ensureLocalStream();
        if (!s) return null;

        return {
          id: userId || "you",
          stream: s,
          isLocal: true as const,
          pinned: true as const,
        };
      }

      const found = remoteStreams.find((s) => s.id === pinnedStage.peerId);
      if (found) {
        return {
          id: pinnedStage.peerId,
          stream: found.stream,
          isLocal: false as const,
          pinned: true as const,
        };
      }
    }
    return null;
  }, [pinnedStage, remoteStreams, userId]);

  // Attach the local stream once; we mutate tracks on it.
  useEffect(() => {
    if (!isClient) return;
    if (!localVideoRef.current) return;
    const s = ensureLocalStream();
    if (!s) return;
    localVideoRef.current.srcObject = s;
  }, [isClient]);

  useEffect(() => {
    try {
      window.localStorage.setItem("huddle:lastRoomId", roomId);
    } catch {
      // ignore
    }
  }, [roomId]);

  const inviteLink = useMemo(() => {
    if (!isClient) return "";
    return `${window.location.origin}/r/${encodeURIComponent(roomId)}`;
  }, [isClient, roomId]);

  // If the player never becomes ready, surface a useful error instead of
  // showing a black screen / 0:00 forever.
  useEffect(() => {
    if (!isClient) return;

    if (loadTimeoutRef.current) {
      window.clearTimeout(loadTimeoutRef.current);
    }

    setIsBuffering(false);
    setPlayerReady(false);
    setPlayerError(null);

    // Prime Video is DRM-protected and not embeddable; surface immediately.
    if (isPrimeVideoUrl(normalizeVideoUrl(url))) {
      setPlayerReady(true);
      setPlayerError(getPrimeVideoMessage());
      return;
    }

    const timeoutMs = getLoadTimeoutMs(url);
    loadTimeoutRef.current = window.setTimeout(() => {
      setPlayerError(getTimeoutErrorMessage(url));
    }, timeoutMs);

    return () => {
      if (loadTimeoutRef.current) {
        window.clearTimeout(loadTimeoutRef.current);
        loadTimeoutRef.current = null;
      }
    };
  }, [isClient, url]);

  // Sync userId with socket.id when connected
  useEffect(() => {
    if (isConnected && socket?.id) {
      setUserId(socket.id);
    }
  }, [isConnected, socket]);

  // Broadcast our media toggles so others can show status.
  useEffect(() => {
    if (!isConnected) return;
    if (!userId) return;
    sendWebRTCMediaState({
      mic: micEnabled,
      cam: camEnabled,
      screen: screenEnabled,
    });
  }, [
    isConnected,
    userId,
    micEnabled,
    camEnabled,
    screenEnabled,
    sendWebRTCMediaState,
  ]);

  const ensureMicEnabled = async () => {
    if (micTrackRef.current) return;
    const local = ensureLocalStream();
    if (!local) return;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: echoCancellationEnabled,
        noiseSuppression: noiseSuppressionEnabled,
        autoGainControl: autoGainControlEnabled,
      },
    });
    const track = stream.getAudioTracks()[0] ?? null;
    if (!track) return;
    micTrackRef.current = track;
    local.addTrack(track);
    setMicTrackVersion((v) => v + 1);
  };

  const disableMic = (skipStateUpdates = false) => {
    const t = micTrackRef.current;
    if (t) {
      try {
        localStreamRef.current?.removeTrack(t);
      } catch {
        // ignore
      }
      try {
        t.stop();
      } catch {
        // ignore
      }
    }
    micTrackRef.current = null;
    if (!skipStateUpdates) {
      setMicTrackVersion((v) => v + 1);
      setLocalSpeaking(false);
      sendWebRTCSpeaking(false);
    }
  };

  const ensureCamEnabled = async () => {
    if (camTrackRef.current) return;
    const local = ensureLocalStream();
    if (!local) return;
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    const track = stream.getVideoTracks()[0] ?? null;
    if (!track) return;
    camTrackRef.current = track;
    setCamTrackVersion((v) => v + 1);
    // Only publish cam if we aren't currently screen sharing.
    if (!screenTrackRef.current) {
      local.addTrack(track);
    }
  };

  const disableCam = (skipStateUpdates = false) => {
    const t = camTrackRef.current;
    if (t) {
      try {
        localStreamRef.current?.removeTrack(t);
      } catch {
        // ignore
      }
      try {
        t.stop();
      } catch {
        // ignore
      }
    }
    camTrackRef.current = null;
    if (!skipStateUpdates) setCamTrackVersion((v) => v + 1);
  };

  const ensureScreenEnabled = async () => {
    if (screenTrackRef.current) return;
    const local = ensureLocalStream();
    if (!local) return;
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false,
    });
    const track = stream.getVideoTracks()[0] ?? null;
    if (!track) return;

    screenStreamRef.current = stream;
    screenTrackRef.current = track;

    // Replace any current published video track.
    for (const vt of local.getVideoTracks()) {
      local.removeTrack(vt);
    }
    local.addTrack(track);

    track.onended = () => {
      setScreenEnabled(false);
    };
  };

  const disableScreen = () => {
    const t = screenTrackRef.current;
    const s = screenStreamRef.current;

    if (t) {
      try {
        localStreamRef.current?.removeTrack(t);
      } catch {
        // ignore
      }
      try {
        t.stop();
      } catch {
        // ignore
      }
    }
    if (s) {
      try {
        s.getTracks().forEach((tt) => tt.stop());
      } catch {
        // ignore
      }
    }

    screenTrackRef.current = null;
    screenStreamRef.current = null;

    // Restore cam video if enabled.
    const camTrack = camTrackRef.current;
    if (camTrack) {
      try {
        localStreamRef.current?.addTrack(camTrack);
      } catch {
        // ignore
      }
    }
  };

  // When toggles change, (re)acquire tracks and renegotiate.
  useEffect(() => {
    if (!isClient) return;

    (async () => {
      try {
        if (micEnabled) await ensureMicEnabled();
        else disableMic();
      } catch {
        setMicEnabled(false);
      }

      try {
        if (camEnabled) await ensureCamEnabled();
        else disableCam();
      } catch {
        setCamEnabled(false);
      }

      try {
        if (screenEnabled) await ensureScreenEnabled();
        else disableScreen();
      } catch {
        setScreenEnabled(false);
      }

      if (isConnected) {
        await renegotiateAllPeers();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [micEnabled, camEnabled, screenEnabled, isClient, isConnected]);

  // Re-acquire mic when audio processing settings change.
  useEffect(() => {
    if (!isClient) return;
    if (!micEnabled) return;
    if (!micTrackRef.current) return;

    (async () => {
      try {
        disableMic(true);
        await ensureMicEnabled();
        if (isConnected) await renegotiateAllPeers();
      } catch {
        setMicEnabled(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    echoCancellationEnabled,
    noiseSuppressionEnabled,
    autoGainControlEnabled,
  ]);

  // If we connect after toggling tracks, negotiate once.
  useEffect(() => {
    if (!isConnected) return;
    renegotiateAllPeers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  // Speaking indicator (simple VAD): marks speaking (no transmission gating).
  useEffect(() => {
    if (!isClient) return;
    const track = micTrackRef.current;
    if (!track) return;

    const start = async () => {
      const stream = new MediaStream([track]);
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      analyserRef.current = analyser;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);

      const threshold = 0.03; // RMS-ish threshold
      const hangMs = 450;

      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const sample = data[i] ?? 128;
          const v = (sample - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        const now = Date.now();
        if (rms > threshold) lastVoiceAtRef.current = now;
        const speakingRaw = now - lastVoiceAtRef.current < hangMs;

        const pttOk = !pushToTalkEnabled || pushToTalkDownRef.current;
        const speakingForTransmit = Boolean(speakingRaw && pttOk);

        if (speakingForTransmit !== lastSpeakingRef.current) {
          lastSpeakingRef.current = speakingForTransmit;
          setLocalSpeaking(speakingForTransmit);
          sendWebRTCSpeaking(speakingForTransmit);
        }

        track.enabled = Boolean(pttOk);

        vadRafRef.current = window.requestAnimationFrame(tick);
      };

      vadRafRef.current = window.requestAnimationFrame(tick);
    };

    start();

    return () => {
      if (vadRafRef.current) {
        window.cancelAnimationFrame(vadRafRef.current);
        vadRafRef.current = null;
      }
      try {
        analyserRef.current?.disconnect();
      } catch {
        // ignore
      }
      analyserRef.current = null;
      const ctx = audioContextRef.current;
      audioContextRef.current = null;
      if (ctx) {
        try {
          ctx.close();
        } catch {
          // ignore
        }
      }
    };
  }, [
    isClient,
    micEnabled,
    micTrackVersion,
    pushToTalkEnabled,
    pushToTalkDownRef,
    sendWebRTCSpeaking,
  ]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      closeAllPeers();
      disableScreen();
      disableCam(true);
      disableMic(true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeAllPeers]);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useEffect(() => {
    const cleanupRoomState = onRoomState?.((state) => {
      if (!state) return;
      if (state.roomId !== roomId) return;

      if (state.videoUrl) {
        const nextUrl = normalizeVideoUrl(state.videoUrl);
        setUrl(nextUrl);
        setInputUrl(nextUrl);
      }

      if (typeof state.timestamp === "number" && playerRef.current) {
        // Only seek if we're far off.
        const current = playerRef.current.currentTime ?? 0;
        if (Math.abs(current - state.timestamp) > 1) {
          playerRef.current.currentTime = state.timestamp;
        }
      }

      if (state.action === "play") setVideoState("Playing");
      if (state.action === "pause") setVideoState("Paused");
    });

    const cleanupChatHistory = onChatHistory?.((data: ChatHistoryData) => {
      if (!data) return;
      if (data.roomId !== roomId) return;
      if (!Array.isArray(data.messages)) return;

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
              : m.senderId || "Unknown";
          next.push({
            id: m.id,
            msg: m.text,
            type: "chat",
            time: t,
            user: userDisplay,
          });
        }

        // Ensure chronological-ish ordering (chat history can arrive after some activity logs)
        return next;
      });
    });

    const cleanupChatMessage = onChatMessage?.((m: ChatMessage) => {
      if (!m) return;
      if (m.roomId !== roomId) return;

      const t = safeToTimeString(m.createdAt);
      const isSystem = m.senderId === "system";
      const isMe = m.senderId === userId;
      const userDisplay = isSystem
        ? "System"
        : isMe
          ? "You"
          : m.senderId || "Unknown";

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
        if (!data) return;
        if (data.roomId !== roomId) return;
        if (!Array.isArray(data.events)) return;

        setLogs((prev) => {
          const existingIds = new Set(prev.map((l) => l.id).filter(Boolean));
          const next = [...prev];

          for (const e of data.events) {
            if (!e?.id || existingIds.has(e.id)) continue;

            const isMe = e.senderId === userId;
            const userDisplay = isMe ? "You" : e.senderId || "Unknown";
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
      if (!e) return;
      if (e.roomId !== roomId) return;

      const mapped = mapActivityEventToLog(e);
      if (!mapped) return;

      const isMe = e.senderId === userId;
      const userDisplay = isMe ? "You" : e.senderId || "Unknown";
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

      setLogs((prev) => [
        ...prev,
        { msg: logMsg, type: data.action, time, user: userDisplay },
      ]);

      if (data.action === "play") {
        setVideoState("Playing");
      }
      if (data.action === "pause") {
        setVideoState("Paused");
      }
      if (data.action === "seek" || data.action === "play") {
        const currentTime = playerRef.current?.currentTime ?? 0;
        if (Math.abs(currentTime - data.timestamp) > 1) {
          if (playerRef.current) playerRef.current.currentTime = data.timestamp;
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
    };
  }, [
    onSyncEvent,
    onRoomState,
    onChatHistory,
    onChatMessage,
    onActivityHistory,
    onActivityEvent,
    roomId,
    userId,
  ]);

  // Ask for the latest room state after we connect.
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

  const handlePlay = () => {
    const currentTime = playerRef.current?.currentTime ?? 0;
    sendSyncEvent("play", currentTime, url);
    setVideoState("Playing");
    // Optimistic update
    const time = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    setLogs((prev) => [
      ...prev,
      { msg: `started playing`, type: "play", time, user: "You" },
    ]);
  };

  const handlePause = () => {
    const currentTime = playerRef.current?.currentTime ?? 0;
    sendSyncEvent("pause", currentTime, url);
    setVideoState("Paused");
    const time = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    setLogs((prev) => [
      ...prev,
      { msg: `paused the video`, type: "pause", time, user: "You" },
    ]);
  };

  const handleSeek = (seconds: number) => {
    const currentTime = playerRef.current?.currentTime ?? 0;
    const newTime = Math.max(0, currentTime + seconds);
    if (playerRef.current) playerRef.current.currentTime = newTime;
    sendSyncEvent("seek", newTime, url);
    const time = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    setLogs((prev) => [
      ...prev,
      {
        msg: `jumped to ${formatTime(newTime)}`,
        type: "seek",
        time,
        user: "You",
      },
    ]);
  };

  const handleUrlChange = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputUrl !== url) {
      setPlayerReady(false);
      setPlayerError(null);
      const nextUrl = normalizeVideoUrl(inputUrl);
      setUrl(nextUrl);
      setInputUrl(nextUrl);
      sendSyncEvent("change_url", 0, nextUrl);
      const time = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      setLogs((prev) => [
        ...prev,
        { msg: `changed video source`, type: "change_url", time, user: "You" },
      ]);
    }
  };

  const handlePlayerError = (e: unknown) => {
    // Ignore AbortError which happens when play is interrupted by pause
    const maybeErr = e as { name?: string; message?: string } | null;
    if (maybeErr?.name === "AbortError") {
      return;
    }
    if (maybeErr?.message?.includes("interrupted by a call to pause")) return;

    // React/Next dev overlay treats console.error as a runtime error.
    // Use warn, and surface the details in the UI instead.
    const currentTarget = (e as { currentTarget?: unknown } | null)
      ?.currentTarget;
    const target = (e as { target?: unknown } | null)?.target;
    const el =
      currentTarget instanceof HTMLMediaElement
        ? currentTarget
        : target instanceof HTMLMediaElement
          ? target
          : undefined;

    const mediaError = el?.error;
    const mediaErrorText = mediaError
      ? `MediaError code ${mediaError.code}${mediaError.message ? `: ${mediaError.message}` : ""}`
      : null;

    const message =
      typeof e === "string"
        ? e
        : maybeErr?.message
          ? String(maybeErr.message)
          : mediaErrorText
            ? mediaErrorText
            : "Video failed to load (often CORS/403/unsupported format).";

    console.warn("Player Error:", e);
    setPlayerError(message);
    const time = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    setLogs((prev) => [
      ...prev,
      {
        msg: `Player Error: ${message}`,
        type: "error",
        time,
        user: "System",
      },
    ]);
  };

  const normalizedUrl = normalizeVideoUrl(url);
  const embedParent = isClient ? window.location.hostname : "localhost";
  const twitchEmbedSrc = getTwitchEmbedSrc(normalizedUrl, embedParent);
  const isTwitch = twitchEmbedSrc !== null;
  const kickEmbedSrc = getKickEmbedSrc(normalizedUrl);
  const isKick = kickEmbedSrc !== null;
  const isPrime = isPrimeVideoUrl(normalizedUrl);
  const isBadYoutubeUrl = isProblematicYoutubeUrl(url);
  const canPlay =
    ((!isBadYoutubeUrl && normalizedUrl.length > 0) || isKick || isTwitch) &&
    !isPrime;
  const canControlPlayback = !isKick && !isTwitch && !isPrime;

  const copyInvite = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // no-op
    }
  };

  const submitRoomPassword = () => {
    const pw = passwordInput.trim();
    lastSubmittedPasswordRef.current = pw;
    joinRoom(pw);
  };

  const stageViewForPlayer = useMemo(() => {
    if (!stageView) return null;
    return {
      id: stageView.id,
      isLocal: stageView.isLocal,
      stream: stageView.stream,
    };
  }, [stageView]);

  const remotesForPlayer = useMemo(() => {
    return remoteStreams.map((s) => ({
      id: s.id,
      stream: s.stream,
      media: remoteMedia[s.id],
    }));
  }, [remoteStreams, remoteMedia]);

  const fullscreenChatMessages = useMemo(() => {
    return logs.filter((l) => l.type === "chat").slice(-30);
  }, [logs]);

  if (roomAccessError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 p-6">
        <div className="max-w-md w-full rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="text-lg font-semibold">Room access</div>
          <div className="text-sm text-slate-300 mt-2">{roomAccessError}</div>
          <div className="mt-5 flex items-center gap-3">
            <Link
              href="/"
              className="h-9 px-4 inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-100 text-sm font-medium hover:bg-white/10 transition-colors"
            >
              Go home
            </Link>
            <button
              type="button"
              onClick={() => {
                try {
                  window.location.reload();
                } catch {
                  // ignore
                }
              }}
              className="h-9 px-4 inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-100 text-sm font-medium hover:bg-white/10 transition-colors"
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-linear-to-b from-slate-900 via-slate-950 to-black text-slate-200">
      <header className="h-16 flex items-center justify-between px-6 lg:px-8 border-b border-white/10 backdrop-blur-md bg-black/30 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="font-semibold text-lg sm:text-xl flex items-center gap-2 text-slate-50 tracking-tight"
          >
            <span aria-hidden className="text-xl">
              🍿
            </span>
            <span>Huddle</span>
          </Link>
          <span className="hidden sm:inline-flex items-center gap-2 text-xs border border-white/10 bg-black/20 rounded-full px-3 py-1 text-slate-300">
            Room <span className="font-mono text-slate-200">{roomId}</span>
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsWheelOpen(true)}
            disabled={passwordRequired}
            className="h-8 px-3 rounded-lg border border-white/10 bg-white/5 text-slate-200 text-xs font-medium hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={
              passwordRequired
                ? "Join with password first"
                : "Open wheel picker"
            }
          >
            Wheel
          </button>

          <button
            onClick={copyInvite}
            className="h-8 px-3 rounded-lg border border-white/10 bg-white/5 text-slate-200 text-xs font-medium hover:bg-white/10 transition-colors"
            title={inviteLink || ""}
          >
            {copied ? "Copied" : "Copy invite"}
          </button>

          <span className="hidden sm:inline-flex items-center gap-2 text-xs font-medium bg-black/20 px-3 py-1 rounded-full border border-white/10">
            <span className="text-slate-300">Password</span>
            <span
              className={hasRoomPassword ? "text-amber-200" : "text-slate-200"}
            >
              {hasRoomPassword ? "On" : "Off"}
            </span>
          </span>

          <div className="flex items-center gap-2 text-xs sm:text-sm font-medium bg-black/20 px-3 py-1 rounded-full border border-white/10">
            <div className="relative">
              <div
                className={`w-2.5 h-2.5 rounded-full ${
                  isConnected ? "bg-emerald-500" : "bg-rose-500"
                }`}
              />
              <div
                className={`absolute -inset-1 rounded-full ${
                  isConnected
                    ? "ring-2 ring-emerald-500/20"
                    : "ring-2 ring-rose-500/20"
                }`}
              />
            </div>
            {isConnected ? "Connected" : "Reconnecting…"}
          </div>
        </div>
      </header>

      {passwordRequired && (
        <div className="fixed inset-0 z-60 flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-lg rounded-2xl border border-white/10 bg-black/40 p-6 shadow-xl">
            <div className="text-xl font-semibold text-slate-50">
              Room password
            </div>
            <div className="mt-2 text-sm text-slate-300">
              {passwordError ?? "This room requires a password."}
            </div>

            <div className="mt-5">
              <input
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="Enter password"
                type="password"
                className="h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-base text-slate-100 placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-white/10"
              />
              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={submitRoomPassword}
                  className="h-11 px-5 rounded-xl border border-white/10 bg-white/5 text-slate-100 text-sm font-medium hover:bg-white/10 transition-colors"
                  disabled={!passwordInput.trim()}
                >
                  Join
                </button>
                <Link
                  href="/"
                  className="h-11 px-5 inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-100 text-sm font-medium hover:bg-white/10 transition-colors"
                >
                  Go home
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      <WheelPickerModal
        open={isWheelOpen && !passwordRequired}
        onClose={() => setIsWheelOpen(false)}
        isConnected={isConnected}
        entries={wheelEntries}
        lastSpin={wheelLastSpin}
        onAddEntry={(text) => addWheelEntry?.(text)}
        onRemoveEntry={(idx) => removeWheelEntry?.(idx)}
        onClear={() => clearWheelEntries?.()}
        onSpin={() => spinWheel?.()}
      />

      <main
        className={`flex-1 grid grid-cols-1 ${
          isActivityCollapsed
            ? "lg:grid-cols-[280px_minmax(0,1fr)]"
            : "lg:grid-cols-[280px_minmax(0,1fr)_320px]"
        } gap-4 px-6 lg:px-8 2xl:px-12 py-6 max-w-screen-2xl 2xl:max-w-none mx-auto w-full`}
      >
        <PlayerSection
          inputUrl={inputUrl}
          setInputUrl={setInputUrl}
          handleUrlChange={handleUrlChange}
          playerContainerRef={playerContainerRef}
          togglePlayerFullscreen={togglePlayerFullscreen}
          isPlayerFullscreen={isPlayerFullscreen}
          isDraggingTile={isDraggingTile}
          setIsDraggingTile={setIsDraggingTile}
          isStageDragOver={isStageDragOver}
          setIsStageDragOver={setIsStageDragOver}
          setPinnedStage={setPinnedStage}
          stageView={stageViewForPlayer}
          screenStageContainerRef={screenStageContainerRef}
          toggleScreenFullscreen={toggleScreenFullscreen}
          isScreenFullscreen={isScreenFullscreen}
          onUnpinStage={() => setPinnedStage(null)}
          localCamTrack={camTrackRef.current}
          remotes={remotesForPlayer}
          isClient={isClient}
          isKick={isKick}
          isTwitch={isTwitch}
          isPrime={isPrime}
          isBadYoutubeUrl={isBadYoutubeUrl}
          normalizedUrl={normalizedUrl}
          kickEmbedSrc={kickEmbedSrc}
          twitchEmbedSrc={twitchEmbedSrc}
          canPlay={canPlay}
          playerReady={playerReady}
          setPlayerReady={setPlayerReady}
          playerError={playerError}
          setPlayerError={setPlayerError}
          isBuffering={isBuffering}
          setIsBuffering={setIsBuffering}
          loadTimeoutRef={loadTimeoutRef}
          playerRef={playerRef}
          handlePlayerError={handlePlayerError}
          muted={muted}
          setMuted={setMuted}
          canControlPlayback={canControlPlayback}
          isConnected={isConnected}
          videoState={videoState}
          handlePlay={handlePlay}
          handlePause={handlePause}
          handleSeek={handleSeek}
          fullscreenChatOpen={fullscreenChatOpen}
          setFullscreenChatOpen={setFullscreenChatOpen}
          fullscreenChatMessages={fullscreenChatMessages}
          chatText={chatText}
          setChatText={setChatText}
          handleSendChat={handleSendChat}
        />

        <CallSidebar
          userId={userId}
          hostId={hostId}
          onKickUser={kickUser}
          participants={participants}
          hasRoomPassword={hasRoomPassword}
          onSetRoomPassword={setRoomPassword}
          localSpeaking={localSpeaking}
          isCallCollapsed={isCallCollapsed}
          setIsCallCollapsed={setIsCallCollapsed}
          micEnabled={micEnabled}
          setMicEnabled={setMicEnabled}
          camEnabled={camEnabled}
          setCamEnabled={setCamEnabled}
          screenEnabled={screenEnabled}
          setScreenEnabled={setScreenEnabled}
          pushToTalkEnabled={pushToTalkEnabled}
          setPushToTalkEnabled={setPushToTalkEnabled}
          pushToTalkDown={pushToTalkDown}
          pushToTalkBindingLabel={pushToTalkBindingLabel}
          stopPushToTalkTransmit={stopPushToTalkTransmit}
          isRebindingPushToTalkKey={isRebindingPushToTalkKey}
          setIsRebindingPushToTalkKey={setIsRebindingPushToTalkKey}
          echoCancellationEnabled={echoCancellationEnabled}
          setEchoCancellationEnabled={setEchoCancellationEnabled}
          noiseSuppressionEnabled={noiseSuppressionEnabled}
          setNoiseSuppressionEnabled={setNoiseSuppressionEnabled}
          autoGainControlEnabled={autoGainControlEnabled}
          setAutoGainControlEnabled={setAutoGainControlEnabled}
          localVideoRef={localVideoRef}
          remoteStreams={remoteStreams}
          remoteSpeaking={remoteSpeaking}
          remoteMedia={remoteMedia}
          setIsDraggingTile={setIsDraggingTile}
          setIsStageDragOver={setIsStageDragOver}
        />

        <ActivitySidebar
          roomId={roomId}
          isConnected={isConnected}
          isActivityCollapsed={isActivityCollapsed}
          setIsActivityCollapsed={setIsActivityCollapsed}
          logs={logs}
          logsEndRef={logsEndRef}
          capitalize={capitalize}
          chatText={chatText}
          setChatText={setChatText}
          handleSendChat={handleSendChat}
        />
      </main>
    </div>
  );
}
