"use client";

import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

/**
 * SoundCloud audio embed with full play/pause/seek sync via the Widget API.
 *
 * The Widget API ships as `https://w.soundcloud.com/player/api.js` and
 * exposes `SC.Widget(iframeEl)` returning a controller with `play()`,
 * `pause()`, `seekTo(milliseconds)`, `getPosition(cb)`, `getDuration(cb)`,
 * `getVolume(cb)`, `setVolume(0..100)`, plus `bind(event, cb)`.
 *
 * Position/duration units are **milliseconds** in the Widget API but the
 * room stores everything in seconds, so we convert at the boundary.
 */

export type SoundCloudEmbedRef = {
  getCurrentTime(): number;
  getDuration(): number;
  seekTo(amount: number, type?: "seconds" | "fraction"): void;
  playVideo(): void;
  pauseVideo(): void;
};

type SoundCloudEmbedProps = {
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

// Loose typing for the SC global; the Widget API isn't typed in DefinitelyTyped.
type ScWidget = {
  bind(event: string, cb: (data?: unknown) => void): void;
  unbind(event: string): void;
  play(): void;
  pause(): void;
  seekTo(milliseconds: number): void;
  setVolume(volume: number): void;
  getPosition(cb: (positionMs: number) => void): void;
  getDuration(cb: (durationMs: number) => void): void;
};
type ScApi = {
  Widget: ((iframe: HTMLIFrameElement) => ScWidget) & {
    Events: {
      READY: string;
      PLAY: string;
      PAUSE: string;
      FINISH: string;
      PLAY_PROGRESS: string;
      SEEK: string;
      ERROR: string;
    };
  };
};
declare global {
  interface Window {
    SC?: ScApi;
  }
}

const WIDGET_API_SRC = "https://w.soundcloud.com/player/api.js";

let scriptPromise: Promise<void> | null = null;
function ensureWidgetApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.SC?.Widget) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${WIDGET_API_SRC}"]`,
    );
    if (existing) {
      // Another component started loading the script first.
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("SoundCloud Widget API failed to load")),
      );
      return;
    }
    const s = document.createElement("script");
    s.src = WIDGET_API_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () =>
      reject(new Error("SoundCloud Widget API failed to load"));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export const SoundCloudEmbed = forwardRef<
  SoundCloudEmbedRef,
  SoundCloudEmbedProps
>(function SoundCloudEmbed(
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
  const widgetRef = useRef<ScWidget | null>(null);
  const isReadyRef = useRef(false);
  const lastPositionSecRef = useRef(0);
  const lastDurationSecRef = useRef(0);
  const suppressNextPlayRef = useRef(false);
  const suppressNextPauseRef = useRef(false);
  const suppressNextSeekRef = useRef(false);

  useImperativeHandle(
    ref,
    () => ({
      getCurrentTime: () => lastPositionSecRef.current,
      getDuration: () => lastDurationSecRef.current,
      seekTo: (amount, type) => {
        const seconds =
          type === "fraction" ? amount * lastDurationSecRef.current : amount;
        suppressNextSeekRef.current = true;
        widgetRef.current?.seekTo(seconds * 1000);
      },
      playVideo: () => {
        suppressNextPlayRef.current = true;
        widgetRef.current?.play();
      },
      pauseVideo: () => {
        suppressNextPauseRef.current = true;
        widgetRef.current?.pause();
      },
    }),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    ensureWidgetApi()
      .then(() => {
        if (cancelled) return;
        const iframe = iframeRef.current;
        if (!iframe || !window.SC?.Widget) return;
        const widget = window.SC.Widget(iframe);
        widgetRef.current = widget;

        widget.bind(window.SC.Widget.Events.READY, () => {
          isReadyRef.current = true;
          // Pull initial duration; SC sets it after the track metadata loads.
          widget.getDuration((ms) => {
            const sec = ms / 1000;
            if (Number.isFinite(sec) && sec > 0) {
              lastDurationSecRef.current = sec;
              onDuration(sec);
            }
          });
          // SoundCloud volume is 0..100; the room uses 0..1.
          widget.setVolume(muted ? 0 : Math.max(0, Math.min(100, volume * 100)));
          onReady();
          if (isPlaying) {
            suppressNextPlayRef.current = true;
            widget.play();
          }
          if (currentTime > 0.5) {
            suppressNextSeekRef.current = true;
            widget.seekTo(currentTime * 1000);
          }
        });

        widget.bind(window.SC.Widget.Events.PLAY, () => {
          if (suppressNextPlayRef.current) {
            suppressNextPlayRef.current = false;
            return;
          }
          if (applyingRemoteSyncRef.current) return;
          onPlay();
        });

        widget.bind(window.SC.Widget.Events.PAUSE, () => {
          if (suppressNextPauseRef.current) {
            suppressNextPauseRef.current = false;
            return;
          }
          if (applyingRemoteSyncRef.current) return;
          onPause();
        });

        widget.bind(window.SC.Widget.Events.SEEK, (data) => {
          if (suppressNextSeekRef.current) {
            suppressNextSeekRef.current = false;
            return;
          }
          if (applyingRemoteSyncRef.current) return;
          const positionMs =
            data && typeof data === "object" && "currentPosition" in data
              ? (data as { currentPosition?: number }).currentPosition
              : undefined;
          if (typeof positionMs === "number" && Number.isFinite(positionMs)) {
            onSeek?.(positionMs / 1000);
          }
        });

        widget.bind(
          window.SC.Widget.Events.PLAY_PROGRESS,
          (data) => {
            const positionMs =
              data && typeof data === "object" && "currentPosition" in data
                ? (data as { currentPosition?: number }).currentPosition
                : undefined;
            if (typeof positionMs === "number" && Number.isFinite(positionMs)) {
              const sec = positionMs / 1000;
              lastPositionSecRef.current = sec;
              onProgress(sec);
            }
          },
        );

        widget.bind(window.SC.Widget.Events.ERROR, (err) => {
          onError(err);
        });
      })
      .catch(onError);

    return () => {
      cancelled = true;
      const w = widgetRef.current;
      if (w && window.SC?.Widget?.Events) {
        try {
          w.unbind(window.SC.Widget.Events.READY);
          w.unbind(window.SC.Widget.Events.PLAY);
          w.unbind(window.SC.Widget.Events.PAUSE);
          w.unbind(window.SC.Widget.Events.SEEK);
          w.unbind(window.SC.Widget.Events.PLAY_PROGRESS);
          w.unbind(window.SC.Widget.Events.ERROR);
        } catch {
          // ignore
        }
      }
      widgetRef.current = null;
      isReadyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  // Push room state -> widget.
  useEffect(() => {
    if (!isReadyRef.current || !widgetRef.current) return;
    if (isPlaying) {
      suppressNextPlayRef.current = true;
      widgetRef.current.play();
    } else {
      suppressNextPauseRef.current = true;
      widgetRef.current.pause();
    }
  }, [isPlaying]);

  useEffect(() => {
    if (!isReadyRef.current || !widgetRef.current) return;
    widgetRef.current.setVolume(
      muted ? 0 : Math.max(0, Math.min(100, volume * 100)),
    );
  }, [volume, muted]);

  return (
    <iframe
      ref={iframeRef}
      key={src}
      src={src}
      title="SoundCloud embed"
      className="absolute inset-0 w-full h-full"
      allow="autoplay"
      referrerPolicy="origin"
      scrolling="no"
      frameBorder="0"
    />
  );
});
