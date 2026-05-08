"use client";

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

/**
 * Dailymotion full-sync embed.
 *
 * Uses the postMessage Player API (the iframe URL must be
 * `geo.dailymotion.com/player.html?video=<id>&api=postMessage`). We post
 * `command` messages in (`play`/`pause`/`seek`/`muted`/`volume`) and listen
 * for `event` messages out (`play`, `pause`, `seeked`, `timeupdate`,
 * `durationchange`, `apiready`).
 *
 * Exposes the same imperative interface as ReactPlayer/HTMLMediaElement
 * (`getCurrentTime`, `getDuration`, `seekTo(seconds, "seconds")`,
 * `playVideo`, `pauseVideo`) so the room's existing playerRef helpers in
 * lib/player.ts work without modification.
 */

export type DailymotionEmbedRef = {
  getCurrentTime(): number;
  getDuration(): number;
  seekTo(amount: number, type?: "seconds" | "fraction"): void;
  playVideo(): void;
  pauseVideo(): void;
};

type DailymotionEmbedProps = {
  src: string;
  isPlaying: boolean;
  currentTime: number;
  volume: number;
  muted: boolean;

  applyingRemoteSyncRef: React.MutableRefObject<boolean>;

  onPlay: () => void;
  onPause: () => void;
  onSeek?: (time: number) => void;
  onProgress: (time: number) => void;
  onDuration: (duration: number) => void;
  onReady: () => void;
  onError: (err: unknown) => void;
};

export const DailymotionEmbed = forwardRef<
  DailymotionEmbedRef,
  DailymotionEmbedProps
>(function DailymotionEmbed(
  {
    src,
    isPlaying,
    currentTime,
    volume,
    muted,
    applyingRemoteSyncRef,
    onPlay,
    onPause,
    onSeek,
    onProgress,
    onDuration,
    onReady,
    onError,
  },
  ref,
) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const isReadyRef = useRef(false);
  const lastReportedTimeRef = useRef(0);
  const lastReportedDurationRef = useRef(0);
  // Suppress the very-next play/pause event coming back from the iframe so
  // we don't echo a remote-applied command back to the room as if the user
  // had clicked it inside the iframe.
  const suppressNextPlayEventRef = useRef(false);
  const suppressNextPauseEventRef = useRef(false);
  const suppressNextSeekedRef = useRef(false);

  const postCommand = useCallback(
    (command: string, params?: Record<string, unknown>) => {
      const win = iframeRef.current?.contentWindow;
      if (!win) return;
      try {
        win.postMessage({ command, parameters: params }, "*");
      } catch (err) {
        // Some browsers throw if the iframe origin isn't ready yet; that's
        // expected during the first 50-100ms.
        void err;
      }
    },
    [],
  );

  useImperativeHandle(
    ref,
    () => ({
      getCurrentTime: () => lastReportedTimeRef.current,
      getDuration: () => lastReportedDurationRef.current,
      seekTo: (amount, type) => {
        const seconds =
          type === "fraction"
            ? amount * lastReportedDurationRef.current
            : amount;
        suppressNextSeekedRef.current = true;
        postCommand("seek", { seconds });
      },
      playVideo: () => {
        suppressNextPlayEventRef.current = true;
        postCommand("play");
      },
      pauseVideo: () => {
        suppressNextPauseEventRef.current = true;
        postCommand("pause");
      },
    }),
    [postCommand],
  );

  // Listen for postMessage events from the iframe.
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const data = e.data as
        | { event?: string; [k: string]: unknown }
        | string
        | null;

      // Dailymotion events come through as URL-encoded strings on some
      // browsers and as plain objects on others. Normalize both.
      let event: string | undefined;
      let payload: Record<string, unknown> = {};
      if (typeof data === "string") {
        try {
          const parsed = new URLSearchParams(data);
          event = parsed.get("event") ?? undefined;
          parsed.forEach((v, k) => {
            if (k !== "event") payload[k] = v;
          });
        } catch {
          return;
        }
      } else if (data && typeof data === "object" && "event" in data) {
        event = (data as { event?: string }).event;
        payload = data as Record<string, unknown>;
      } else {
        return;
      }

      if (!event) return;

      switch (event) {
        case "apiready": {
          isReadyRef.current = true;
          onReady();
          // Apply current state once the player is ready.
          postCommand("muted", { muted });
          postCommand("volume", { volume });
          if (isPlaying) {
            suppressNextPlayEventRef.current = true;
            postCommand("play");
          }
          if (currentTime > 0.5) {
            suppressNextSeekedRef.current = true;
            postCommand("seek", { seconds: currentTime });
          }
          break;
        }
        case "play":
        case "playing": {
          if (suppressNextPlayEventRef.current) {
            suppressNextPlayEventRef.current = false;
            return;
          }
          if (applyingRemoteSyncRef.current) return;
          onPlay();
          break;
        }
        case "pause": {
          if (suppressNextPauseEventRef.current) {
            suppressNextPauseEventRef.current = false;
            return;
          }
          if (applyingRemoteSyncRef.current) return;
          onPause();
          break;
        }
        case "seeked": {
          if (suppressNextSeekedRef.current) {
            suppressNextSeekedRef.current = false;
            return;
          }
          if (applyingRemoteSyncRef.current) return;
          const t =
            typeof payload.time === "string"
              ? Number(payload.time)
              : typeof payload.time === "number"
                ? payload.time
                : NaN;
          if (Number.isFinite(t) && onSeek) onSeek(t);
          break;
        }
        case "timeupdate": {
          const t =
            typeof payload.time === "string"
              ? Number(payload.time)
              : typeof payload.time === "number"
                ? payload.time
                : NaN;
          if (Number.isFinite(t)) {
            lastReportedTimeRef.current = t;
            onProgress(t);
          }
          break;
        }
        case "durationchange": {
          const d =
            typeof payload.duration === "string"
              ? Number(payload.duration)
              : typeof payload.duration === "number"
                ? payload.duration
                : NaN;
          if (Number.isFinite(d) && d > 0) {
            lastReportedDurationRef.current = d;
            onDuration(d);
          }
          break;
        }
        case "error": {
          onError(payload);
          break;
        }
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push state changes from the room into the iframe.
  useEffect(() => {
    if (!isReadyRef.current) return;
    if (isPlaying) {
      suppressNextPlayEventRef.current = true;
      postCommand("play");
    } else {
      suppressNextPauseEventRef.current = true;
      postCommand("pause");
    }
  }, [isPlaying, postCommand]);

  useEffect(() => {
    if (!isReadyRef.current) return;
    postCommand("muted", { muted });
  }, [muted, postCommand]);

  useEffect(() => {
    if (!isReadyRef.current) return;
    postCommand("volume", { volume });
  }, [volume, postCommand]);

  return (
    <iframe
      ref={iframeRef}
      key={src}
      src={src}
      title="Dailymotion embed"
      className="absolute inset-0 w-full h-full"
      allow="autoplay; fullscreen; picture-in-picture"
      allowFullScreen
      referrerPolicy="origin"
    />
  );
});
