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
} from "shared-logic";
import ReactPlayer from "react-player";

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

  useEffect(() => {
    setIsClient(true);
  }, []);

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
          const isMe = m.senderId === userId;
          const userDisplay = isMe ? "You" : m.senderId || "Unknown";
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
      const isMe = m.senderId === userId;
      const userDisplay = isMe ? "You" : m.senderId || "Unknown";

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
            onClick={copyInvite}
            className="h-8 px-3 rounded-lg border border-white/10 bg-white/5 text-slate-200 text-xs font-medium hover:bg-white/10 transition-colors"
            title={inviteLink || ""}
          >
            {copied ? "Copied" : "Copy invite"}
          </button>
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

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 lg:gap-8 p-6 lg:p-8 max-w-7xl mx-auto w-full">
        <section className="flex flex-col gap-6">
          <div className="backdrop-blur-md bg-white/5 rounded-2xl border border-white/10 p-4 sm:p-5">
            <div className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-4">
                <div>
                  <div className="font-semibold text-slate-50">
                    Video source
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    Paste a link (Kick/Twitch/YouTube) or a direct file URL
                    (MP4/WebM).
                  </div>
                </div>
                <div className="hidden sm:flex items-center gap-2">
                  <span className="px-2 py-1 rounded-full text-[11px] border border-white/10 bg-black/20 text-slate-300">
                    YouTube
                  </span>
                  <span className="px-2 py-1 rounded-full text-[11px] border border-white/10 bg-black/20 text-slate-300">
                    Twitch
                  </span>
                  <span className="px-2 py-1 rounded-full text-[11px] border border-white/10 bg-black/20 text-slate-300">
                    Kick
                  </span>
                  <span className="px-2 py-1 rounded-full text-[11px] border border-white/10 bg-black/20 text-slate-300">
                    Prime (link)
                  </span>
                </div>
              </div>

              <form onSubmit={handleUrlChange} className="flex gap-2 w-full">
                <input
                  type="text"
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  placeholder="e.g. kick.com/elwind"
                  className="flex-1 bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/40 transition"
                />
                <button
                  type="submit"
                  className="h-11 px-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors text-sm font-medium text-slate-50"
                >
                  Load
                </button>
              </form>
            </div>
          </div>

          <div className="w-full aspect-video bg-black/40 rounded-2xl relative overflow-hidden border border-white/10">
            {isClient && (
              <div className="absolute inset-0">
                {isKick ? (
                  <iframe
                    key={kickEmbedSrc ?? normalizedUrl}
                    src={kickEmbedSrc ?? undefined}
                    className="absolute inset-0 w-full h-full"
                    allow="autoplay; fullscreen; picture-in-picture"
                    allowFullScreen
                    referrerPolicy="origin"
                    onLoad={() => {
                      setPlayerReady(true);
                      setPlayerError(null);
                      setIsBuffering(false);
                      if (loadTimeoutRef.current) {
                        window.clearTimeout(loadTimeoutRef.current);
                        loadTimeoutRef.current = null;
                      }
                    }}
                  />
                ) : isTwitch ? (
                  <iframe
                    key={twitchEmbedSrc ?? normalizedUrl}
                    src={twitchEmbedSrc ?? undefined}
                    className="absolute inset-0 w-full h-full"
                    allow="autoplay; fullscreen; picture-in-picture"
                    allowFullScreen
                    referrerPolicy="origin"
                    onLoad={() => {
                      setPlayerReady(true);
                      setPlayerError(null);
                      setIsBuffering(false);
                      if (loadTimeoutRef.current) {
                        window.clearTimeout(loadTimeoutRef.current);
                        loadTimeoutRef.current = null;
                      }
                    }}
                  />
                ) : isPrime ? (
                  <div className="absolute inset-0" />
                ) : (
                  <ReactPlayer
                    ref={playerRef}
                    key={normalizedUrl}
                    src={canPlay ? normalizedUrl : undefined}
                    playing={videoState === "Playing"}
                    muted={muted}
                    width="100%"
                    height="100%"
                    controls
                    playsInline
                    onError={handlePlayerError}
                    onReady={() => {
                      setPlayerReady(true);
                      setPlayerError(null);
                      setIsBuffering(false);
                      if (loadTimeoutRef.current) {
                        window.clearTimeout(loadTimeoutRef.current);
                        loadTimeoutRef.current = null;
                      }
                    }}
                    onStart={() => {
                      setPlayerReady(true);
                      setIsBuffering(false);
                      if (loadTimeoutRef.current) {
                        window.clearTimeout(loadTimeoutRef.current);
                        loadTimeoutRef.current = null;
                      }
                    }}
                    onPlay={() => {
                      setPlayerReady(true);
                      setIsBuffering(false);
                      if (loadTimeoutRef.current) {
                        window.clearTimeout(loadTimeoutRef.current);
                        loadTimeoutRef.current = null;
                      }
                    }}
                    onPause={() => setIsBuffering(false)}
                    onEnded={() => setIsBuffering(false)}
                    style={{ position: "absolute", inset: 0 }}
                  />
                )}
              </div>
            )}

            {(isKick || isTwitch || isPrime) && (
              <div className="absolute top-3 left-3 z-10">
                <span className="px-2.5 py-1 rounded-full text-[11px] font-medium border border-white/10 bg-black/40 text-slate-200">
                  {isKick ? "Kick" : isTwitch ? "Twitch" : "Prime Video"}
                </span>
              </div>
            )}

            {isPrime && (
              <div className="absolute inset-0 flex items-center justify-center text-center px-6 text-slate-200 bg-black/70">
                <div>
                  <div className="font-semibold">
                    Prime Video can’t be embedded
                  </div>
                  <div className="text-sm text-slate-300 mt-1">
                    Prime Video is DRM-protected, so it won’t play inside
                    Huddle. Open it in a new tab and we can still sync the link.
                  </div>
                  <div className="text-xs text-slate-400 mt-3 break-all">
                    URL: {normalizedUrl}
                  </div>
                  <div className="mt-3">
                    <a
                      href={normalizedUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs underline underline-offset-4 text-slate-200"
                    >
                      Open Prime Video in new tab
                    </a>
                  </div>
                </div>
              </div>
            )}

            {isBadYoutubeUrl && (
              <div className="absolute inset-0 flex items-center justify-center text-center px-6 text-slate-200 bg-black/70">
                <div>
                  <div className="font-semibold">
                    This YouTube link won’t embed
                  </div>
                  <div className="text-sm text-slate-300 mt-1">
                    “Radio / playlist” links often load forever at 0:00.
                  </div>
                  <div className="text-sm text-slate-300 mt-3">
                    Use a normal watch URL like:
                    <div className="font-mono text-xs mt-1 break-all">
                      https://www.youtube.com/watch?v=jNQXAC9IVRw
                    </div>
                  </div>
                </div>
              </div>
            )}

            {canPlay && !playerReady && !playerError && (
              <div className="absolute inset-0 flex items-center justify-center text-slate-300 bg-black/40">
                {isBuffering ? "Buffering…" : "Loading video…"}
              </div>
            )}

            {playerError && (
              <div className="absolute inset-0 flex items-center justify-center text-center px-6 text-slate-200 bg-black/70">
                <div>
                  <div className="font-semibold">Player error</div>
                  <div className="text-sm text-slate-300 mt-1 wrap-break-word">
                    {playerError}
                  </div>
                  <div className="text-xs text-slate-400 mt-3 break-all">
                    URL: {normalizedUrl}
                  </div>
                  <div className="mt-3">
                    <a
                      href={normalizedUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs underline underline-offset-4 text-slate-200"
                    >
                      Open URL in new tab
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="backdrop-blur-md bg-white/5 p-4 rounded-2xl border border-white/10 w-fit mx-auto">
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                className="h-11 px-4 rounded-xl font-semibold text-sm transition-colors bg-white/5 text-slate-50 border border-white/10 hover:bg-white/10 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => setMuted(!muted)}
                disabled={!canControlPlayback}
                title={
                  canControlPlayback
                    ? undefined
                    : isPrime
                      ? "Prime Video can’t be controlled inside Huddle"
                      : isKick
                        ? "Kick embeds can’t be muted programmatically"
                        : "Twitch embeds can’t be muted programmatically"
                }
              >
                {muted ? "🔇 Unmute" : "🔊 Mute"}
              </button>

              <button
                className="h-11 px-6 rounded-xl font-semibold text-sm transition-colors bg-white/5 text-slate-50 border border-white/10 hover:bg-white/10 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => handleSeek(-10)}
                disabled={!isConnected || !canControlPlayback}
                title="-10 Seconds"
              >
                ⏪ -10s
              </button>

              <button
                className="h-11 px-6 rounded-xl font-semibold text-sm transition-colors bg-slate-50 text-slate-950 hover:bg-slate-50/90 disabled:opacity-50 disabled:cursor-not-allowed min-w-30 justify-center"
                onClick={videoState === "Playing" ? handlePause : handlePlay}
                disabled={!isConnected || !canControlPlayback}
                title={
                  canControlPlayback
                    ? undefined
                    : isPrime
                      ? "Prime Video can’t be controlled inside Huddle"
                      : isKick
                        ? "Kick embeds can’t be controlled programmatically"
                        : "Twitch embeds can’t be controlled programmatically"
                }
              >
                {videoState === "Playing" ? "PAUSE" : "PLAY"}
              </button>

              <button
                className="h-11 px-6 rounded-xl font-semibold text-sm transition-colors bg-white/5 text-slate-50 border border-white/10 hover:bg-white/10 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => handleSeek(10)}
                disabled={!isConnected || !canControlPlayback}
                title="+10 Seconds"
              >
                +10s ⏩
              </button>
            </div>
          </div>
        </section>

        <aside className="backdrop-blur-md bg-white/5 rounded-2xl border border-white/10 flex flex-col overflow-hidden min-h-105">
          <div className="p-4 border-b border-white/10 bg-white/5">
            <div className="font-semibold text-slate-50">Activity Feed</div>
            <div className="text-xs text-slate-400 mt-1">
              Room: <span className="font-mono text-slate-300">{roomId}</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {logs.length === 0 && (
              <div className="text-center text-slate-500 mt-8 text-sm">
                Waiting for activity...
              </div>
            )}
            {logs.map((log, i) => (
              <div
                key={i}
                className={`p-3 rounded-xl bg-black/20 border border-white/5 text-sm ${
                  log.type === "play"
                    ? "border-l-4 border-l-emerald-500"
                    : log.type === "pause"
                      ? "border-l-4 border-l-amber-500"
                      : log.type === "seek"
                        ? "border-l-4 border-l-indigo-500"
                        : log.type === "change_url"
                          ? "border-l-4 border-l-rose-500"
                          : log.type === "chat"
                            ? "border-l-4 border-l-sky-500"
                            : log.type === "join" || log.type === "leave"
                              ? "border-l-4 border-l-violet-500"
                              : log.type === "error"
                                ? "border-l-4 border-l-red-600"
                                : ""
                }`}
              >
                <div className="flex justify-between items-center mb-1 text-xs text-slate-500">
                  <span className="uppercase tracking-wider font-bold text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-slate-400">
                    {capitalize(log.type)}
                  </span>
                  <span>{log.time}</span>
                </div>
                <div className="text-slate-300 leading-relaxed">
                  <strong className="text-slate-200">{log.user}</strong>{" "}
                  {log.msg}
                </div>
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>

          <form
            onSubmit={handleSendChat}
            className="p-3 border-t border-white/10 bg-black/20 flex gap-2"
          >
            <input
              type="text"
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              placeholder={isConnected ? "Type a message…" : "Connecting…"}
              disabled={!isConnected}
              className="flex-1 bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/25 focus:border-sky-500/30 transition disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!isConnected || !chatText.trim()}
              className="h-9 px-4 rounded-xl border border-white/10 bg-white/5 text-slate-50 text-sm font-medium hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </form>
        </aside>
      </main>
    </div>
  );
}

function safeToTimeString(value: string | Date) {
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) {
      return new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    }
    return d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }
}

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function capitalize(s: string) {
  if (s === "change_url") return "Change";
  if (s === "chat") return "Chat";
  if (s === "join") return "Join";
  if (s === "leave") return "Leave";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function mapActivityEventToLog(
  e: ActivityEvent
): { type: string; msg: string } | null {
  if (!e) return null;

  if (e.kind === "join") {
    return { type: "join", msg: "joined the room" };
  }

  if (e.kind === "leave") {
    return { type: "leave", msg: "left the room" };
  }

  if (e.kind === "sync") {
    const action = e.action ?? undefined;
    if (action === "play") return { type: "play", msg: "started playing" };
    if (action === "pause") return { type: "pause", msg: "paused the video" };
    if (action === "seek") {
      const ts = typeof e.timestamp === "number" ? e.timestamp : 0;
      return { type: "seek", msg: `jumped to ${formatTime(ts)}` };
    }
    if (action === "change_url") {
      const url = typeof e.videoUrl === "string" ? e.videoUrl : "";
      return {
        type: "change_url",
        msg: url ? `changed video source to ${url}` : "changed video source",
      };
    }
  }

  return null;
}

function isProblematicYoutubeUrl(rawUrl: string) {
  // These commonly show a black player stuck at 0:00 in embeds.
  // Example: list=RD...&start_radio=1
  return (
    /youtube\.com\/watch\?/.test(rawUrl) &&
    /[?&](list=RD|start_radio=1)/.test(rawUrl)
  );
}

function normalizeVideoUrl(rawUrl: string) {
  const trimmed = rawUrl.trim();

  // Accept inputs like `kick.com/elwind` / `twitch.tv/shroud` by adding https://
  const withScheme = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed)
    ? trimmed
    : /^([\w-]+\.)+[\w-]+(\/|$)/.test(trimmed)
      ? `https://${trimmed}`
      : trimmed;

  // If it's a normal YouTube watch URL, strip playlist/radio params that often break embeds.
  try {
    const url = new URL(withScheme);
    const host = url.hostname.replace(/^www\./, "");
    const isYoutube = host === "youtube.com" || host === "m.youtube.com";
    const isWatch = isYoutube && url.pathname === "/watch";

    if (!isWatch) return withScheme;

    const videoId = url.searchParams.get("v");
    if (!videoId) return withScheme;

    // keep only `v`
    return `https://www.youtube.com/watch?v=${videoId}`;
  } catch {
    return withScheme;
  }
}

function getLoadTimeoutMs(rawUrl: string) {
  const normalized = normalizeVideoUrl(rawUrl);
  if (getKickEmbedSrc(normalized)) return 25000;
  if (isTwitchUrl(normalized)) return 25000;
  const isFile = /\.(mp4|webm|ogv|ogg)(\?|#|$)/i.test(normalized);
  return isFile ? 25000 : 12000;
}

function getTimeoutErrorMessage(rawUrl: string) {
  const normalized = normalizeVideoUrl(rawUrl);

  if (isPrimeVideoUrl(normalized)) {
    return getPrimeVideoMessage();
  }

  if (getKickEmbedSrc(normalized)) {
    return "Timed out loading this Kick embed. If you use ad/privacy blockers, try disabling them for kick.com, then reload.";
  }

  if (isTwitchUrl(normalized)) {
    return "Timed out loading this Twitch embed. Twitch requires an embed `parent` parameter; if you use ad/privacy blockers, try disabling them for twitch.tv, then reload.";
  }

  if (isProblematicYoutubeUrl(rawUrl)) {
    return "Timed out loading this YouTube embed. Try a different YouTube watch URL (no playlist/radio), or disable ad/privacy extensions that block YouTube embeds.";
  }

  return "Timed out loading this video. If this is a YouTube link, use a normal watch URL (no playlist/radio). If you use ad/privacy blockers, try disabling them for this site.";
}

function getPrimeVideoMessage() {
  return "Prime Video is DRM-protected and can’t be embedded/controlled inside Huddle. Open it in a new tab/app; Huddle can still sync the link for everyone.";
}

function isPrimeVideoUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    return host === "primevideo.com" || host.endsWith(".primevideo.com");
  } catch {
    return false;
  }
}

function isTwitchUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    return host === "twitch.tv" || host === "clips.twitch.tv";
  } catch {
    return false;
  }
}

function getTwitchEmbedSrc(rawUrl: string, parent: string): string | null {
  // Twitch embeds require `parent=<your domain>` or the iframe shows blank.
  // Supports:
  // - https://www.twitch.tv/<channel>
  // - https://www.twitch.tv/videos/<id>
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();

    let channel: string | null = null;
    let videoId: string | null = null;

    if (host === "twitch.tv") {
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length === 0) return null;

      if (parts[0] === "videos" && parts[1]) {
        videoId = parts[1];
      } else {
        // channel page
        channel = parts[0] ?? null;
      }
    } else if (host === "clips.twitch.tv") {
      // Clip embeds are different; skip for now.
      return null;
    } else {
      return null;
    }

    const p = parent || "localhost";
    const qs = new URLSearchParams();
    qs.set("parent", p);
    qs.set("autoplay", "false");
    qs.set("muted", "true");

    if (videoId) {
      qs.set("video", videoId);
      return `https://player.twitch.tv/?${qs.toString()}`;
    }

    if (channel) {
      qs.set("channel", channel);
      return `https://player.twitch.tv/?${qs.toString()}`;
    }

    return null;
  } catch {
    return null;
  }
}

function getKickEmbedSrc(rawUrl: string): string | null {
  // Supports:
  // - https://kick.com/<channel>
  // - https://www.kick.com/<channel>
  // - https://kick.com/video/<id>
  // Uses Kick's player host: https://player.kick.com/...
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (host !== "kick.com") return null;

    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length === 0) return null;

    if (parts[0] === "video" && parts[1]) {
      return `https://player.kick.com/video/${encodeURIComponent(parts[1])}`;
    }

    // Channel page: /<channel>
    const channel = parts[0];
    if (!channel) return null;
    // Avoid embedding obvious non-channel paths
    if (
      ["categories", "clips", "settings", "terms", "privacy"].includes(channel)
    ) {
      return null;
    }

    return `https://player.kick.com/${encodeURIComponent(channel)}`;
  } catch {
    return null;
  }
}
