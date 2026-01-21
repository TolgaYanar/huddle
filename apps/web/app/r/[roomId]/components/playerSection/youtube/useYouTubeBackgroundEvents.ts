import * as React from "react";

import { getYouTubeVideoId } from "../../../lib/video";
import {
  getInternalCurrentVideoId,
  getInternalPlayerFromRef,
} from "./internal";

export function useYouTubeBackgroundEvents({
  isClient,
  isYouTube,
  isPageVisible,
  normalizedUrl,
  onVideoEnded,
  playerRef,
  videoState,
  applyingRemoteSyncRef,
  debugYouTube,
  effectiveMuted,
  effectiveVolume,
  useYouTubeIFrameApi,
  suppressNextPlayBroadcast,
  ytRequestedIdRef,
  ytConfirmedIdRef,
  setYtAudioBlockedInBackground,
}: {
  isClient: boolean;
  isYouTube: boolean;
  isPageVisible: boolean;
  normalizedUrl: string;
  onVideoEnded?: () => void;
  playerRef: React.RefObject<unknown>;
  videoState: string;
  applyingRemoteSyncRef: React.MutableRefObject<boolean>;
  debugYouTube: boolean;
  effectiveMuted: boolean;
  effectiveVolume: number;
  useYouTubeIFrameApi: boolean;
  suppressNextPlayBroadcast: (ms?: number) => void;
  ytRequestedIdRef: React.MutableRefObject<string | null>;
  ytConfirmedIdRef: React.MutableRefObject<string | null>;
  setYtAudioBlockedInBackground: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  // YouTube background-safe ended detection:
  // ReactPlayer's `onEnded` can be unreliable when autoplay restrictions kick in
  // after a URL change while the tab is unfocused. The IFrame API emits
  // onStateChange(ENDED=0) even in the background.
  const ytEndedAtRef = React.useRef(0);
  const ytEnsurePlayAtRef = React.useRef(0);
  const ytEnsureAudioAtRef = React.useRef(0);
  const ytHiddenSwitchAtRef = React.useRef(0);

  React.useEffect(() => {
    if (!isClient) return;
    if (!isYouTube) return;
    if (useYouTubeIFrameApi) return;

    let cancelled = false;
    let attachTimer: number | null = null;

    const tryAttach = () => {
      if (cancelled) return;

      const internal = getInternalPlayerFromRef(playerRef);

      if (!internal || typeof internal.addEventListener !== "function") {
        // ReactPlayer may not have created the IFrame player yet; retry briefly.
        attachTimer = window.setTimeout(tryAttach, 250);
        return;
      }

      const ensurePlayingIfExpected = () => {
        if (applyingRemoteSyncRef.current) return;
        if (videoState !== "Playing") return;

        // Don't restart an old video at its end; only kick play if the internal
        // player is already on the URL's intended video id.
        const desiredId = getYouTubeVideoId(normalizedUrl);
        if (!desiredId) return;

        const currentId = getInternalCurrentVideoId(internal);

        if (currentId !== desiredId) {
          if (debugYouTube) {
            console.debug("[yt] skip kick; not on desired id", {
              desiredId,
              currentId,
              requested: ytRequestedIdRef.current,
              confirmed: ytConfirmedIdRef.current,
            });
          }
          return;
        }

        const ensureAudioIfExpected = () => {
          if (applyingRemoteSyncRef.current) return;
          if (videoState !== "Playing") return;

          const now = Date.now();
          if (now - ytEnsureAudioAtRef.current < 2000) return;
          ytEnsureAudioAtRef.current = now;

          try {
            if (effectiveMuted) {
              internal.mute?.();
              return;
            }

            // Best-effort: some browsers/YouTube policies may still prevent
            // unmuting without a user gesture, but this helps when it *is*
            // allowed and the next video starts muted.
            internal.unMute?.();

            const vol = Math.max(
              0,
              Math.min(100, Math.round(effectiveVolume * 100)),
            );
            if (vol > 0) internal.setVolume?.(vol);

            // If we're hidden and unmute is being ignored, it's almost always
            // a browser autoplay policy requiring a user gesture.
            if (!isPageVisible) {
              const muted = internal.isMuted?.();
              if (muted === true) {
                setYtAudioBlockedInBackground(true);
              }
            }
          } catch {
            // ignore
          }
        };

        ensureAudioIfExpected();

        const now = Date.now();
        if (now - ytEnsurePlayAtRef.current < 1200) return;
        ytEnsurePlayAtRef.current = now;

        try {
          suppressNextPlayBroadcast(2000);
          internal.playVideo?.();
        } catch {
          // ignore
        }
      };

      const onStateChange = (ev: unknown) => {
        const data = (ev as { data?: unknown } | null)?.data;
        // YouTube IFrame API: ENDED === 0
        if (data !== 0) return;

        const now = Date.now();
        if (now - ytEndedAtRef.current < 1500) return;
        ytEndedAtRef.current = now;

        onVideoEnded?.();
      };

      // If the next track loads while the tab is unfocused, YouTube may sit in
      // CUED (5) or UNSTARTED (-1) until the user refocuses. Kick playVideo.
      const onStateChangeWithKick = (ev: unknown) => {
        const data = (ev as { data?: unknown } | null)?.data;
        if (data === 0) {
          onStateChange(ev);
          return;
        }

        // -1: unstarted, 5: cued
        if (data === -1 || data === 5) {
          if (debugYouTube) {
            console.debug("[yt] state", { data, videoState, normalizedUrl });
          }
          ensurePlayingIfExpected();
        }
      };

      try {
        internal.addEventListener("onStateChange", onStateChangeWithKick);
      } catch {
        // ignore
      }

      // Background fallback: in hidden tabs, YouTube may not reliably fire
      // statechange events. Poll player state and kick play when needed.
      let pollTimer: number | null = null;
      const startPoll = () => {
        if (pollTimer) return;
        pollTimer = window.setInterval(() => {
          if (cancelled) return;
          if (isPageVisible) return;
          if (applyingRemoteSyncRef.current) return;
          if (videoState !== "Playing") return;

          const desiredId = getYouTubeVideoId(normalizedUrl);
          if (!desiredId) return;

          const currentId = getInternalCurrentVideoId(internal);

          if (currentId !== desiredId) {
            // Attempt to advance the internal player to the desired item.
            // Background tabs can throttle timeouts heavily, so do a periodic
            // best-effort switch here.
            const now = Date.now();
            if (now - ytHiddenSwitchAtRef.current < 2500) return;
            ytHiddenSwitchAtRef.current = now;

            if (debugYouTube) {
              console.debug("[yt] hidden poll switch", {
                desiredId,
                currentId,
                normalizedUrl,
              });
            }

            try {
              (internal.loadVideoById ?? internal.cueVideoById)?.(desiredId);
            } catch {
              // ignore
            }
            return;
          }

          // If we're on the desired item but audio is missing in background,
          // try to re-assert unmute/volume before (or while) kicking play.
          if (!effectiveMuted && effectiveVolume > 0) {
            const now = Date.now();
            if (now - ytEnsureAudioAtRef.current >= 2000) {
              ytEnsureAudioAtRef.current = now;
              try {
                internal.unMute?.();
                internal.setVolume?.(
                  Math.max(0, Math.min(100, Math.round(effectiveVolume * 100))),
                );

                const muted = internal.isMuted?.();
                if (muted === true) {
                  setYtAudioBlockedInBackground(true);
                }
              } catch {
                // ignore
              }
            }
          }

          const st = internal.getPlayerState?.();
          // YouTube states: -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued
          if (st === 1) return;
          if (st === 0) return;

          const now = Date.now();
          if (now - ytEnsurePlayAtRef.current < 1500) return;
          ytEnsurePlayAtRef.current = now;

          if (debugYouTube) {
            console.debug("[yt] hidden poll kick", {
              st,
              desiredId,
              normalizedUrl,
            });
          }

          try {
            suppressNextPlayBroadcast(2000);
            internal.playVideo?.();
          } catch {
            // ignore
          }
        }, 2000);
      };
      startPoll();

      return () => {
        if (pollTimer) {
          window.clearInterval(pollTimer);
          pollTimer = null;
        }
        try {
          internal.removeEventListener?.(
            "onStateChange",
            onStateChangeWithKick,
          );
        } catch {
          // ignore
        }
      };
    };

    const detach = tryAttach();

    return () => {
      cancelled = true;
      if (attachTimer) window.clearTimeout(attachTimer);
      if (typeof detach === "function") detach();
    };
  }, [
    isClient,
    isYouTube,
    isPageVisible,
    normalizedUrl,
    onVideoEnded,
    playerRef,
    videoState,
    applyingRemoteSyncRef,
    debugYouTube,
    effectiveMuted,
    effectiveVolume,
    useYouTubeIFrameApi,
    suppressNextPlayBroadcast,
    ytRequestedIdRef,
    ytConfirmedIdRef,
    setYtAudioBlockedInBackground,
  ]);
}
