import * as React from "react";

import { getYouTubeVideoId } from "../../../lib/video";
import {
  getInternalCurrentVideoId,
  getInternalPlayerFromRef,
  isInternalIframeConnected,
} from "./internal";

export function useYouTubeSwitchByIFrameApi({
  isClient,
  isYouTube,
  normalizedUrl,
  playerRef,
  videoState,
  debugYouTube,
  useYouTubeIFrameApi,
  ytConfirmedId,
  ytConfirmedIdRef,
  ytRequestedIdRef,
  setYtConfirmedId,
  setPlayerReady,
  setPlayerError,
  setIsBuffering,
  clearLoadTimeout,
  suppressNextPlayBroadcast,
  ytLastForcedRemountIdRef,
  setYoutubeMountUrl,
}: {
  isClient: boolean;
  isYouTube: boolean;
  normalizedUrl: string;
  playerRef: React.RefObject<unknown>;
  videoState: string;
  debugYouTube: boolean;
  useYouTubeIFrameApi: boolean;
  ytConfirmedId: string | null;
  ytConfirmedIdRef: React.MutableRefObject<string | null>;
  ytRequestedIdRef: React.MutableRefObject<string | null>;
  setYtConfirmedId: React.Dispatch<React.SetStateAction<string | null>>;
  setPlayerReady: React.Dispatch<React.SetStateAction<boolean>>;
  setPlayerError: React.Dispatch<React.SetStateAction<string | null>>;
  setIsBuffering: React.Dispatch<React.SetStateAction<boolean>>;
  clearLoadTimeout: () => void;
  suppressNextPlayBroadcast: (ms?: number) => void;
  ytLastForcedRemountIdRef: React.MutableRefObject<string | null>;
  setYoutubeMountUrl: React.Dispatch<React.SetStateAction<string | null>>;
}) {
  // When the room URL changes to a new YouTube video, switch it using the
  // existing YT player instance.
  React.useEffect(() => {
    if (!isClient) return;
    if (!isYouTube) return;
    if (useYouTubeIFrameApi) return;

    const targetId = getYouTubeVideoId(normalizedUrl);
    if (!targetId) return;

    // If we've already confirmed we're on the desired id, don't let transient
    // failures (getVideoData/getVideoUrl returning null) pause playback.
    const isAlreadyConfirmed =
      ytConfirmedIdRef.current === targetId || ytConfirmedId === targetId;

    let cancelled = false;
    let retryTimer: number | null = null;

    const tryLoad = () => {
      if (cancelled) return;

      const internal = getInternalPlayerFromRef(playerRef);

      if (
        !internal ||
        (typeof internal.loadVideoById !== "function" &&
          typeof internal.cueVideoById !== "function")
      ) {
        retryTimer = window.setTimeout(tryLoad, 250);
        return;
      }

      // During remounts, ReactPlayer can briefly hand us an internal player
      // whose iframe isn't attached yet. Calling loadVideoById/cueVideoById in
      // that state triggers the YT warning and can prevent playback.
      if (!isInternalIframeConnected(internal)) {
        retryTimer = window.setTimeout(tryLoad, 250);
        return;
      }

      // Verify current video id so we don't accidentally restart an old video.
      const currentId = getInternalCurrentVideoId(internal);

      if (currentId === targetId) {
        ytConfirmedIdRef.current = targetId;
        ytRequestedIdRef.current = targetId;
        setYtConfirmedId(targetId);
        // We may have set playerReady=false when the room URL changed. In the
        // stable-iframe approach, onReady does not fire again; mark ready here.
        setPlayerReady(true);
        setPlayerError(null);
        setIsBuffering(false);
        clearLoadTimeout();
        return;
      }

      // If YouTube can't report the current id right now but we already
      // confirmed the target, keep playing.
      if (currentId === null && isAlreadyConfirmed) {
        ytRequestedIdRef.current = targetId;
        setPlayerReady(true);
        setPlayerError(null);
        setIsBuffering(false);
        clearLoadTimeout();
        return;
      }

      // Track what we WANT, but don't mark as confirmed until we verify.
      ytRequestedIdRef.current = targetId;
      if (!isAlreadyConfirmed) {
        ytConfirmedIdRef.current = null;
        setYtConfirmedId(null);
      }

      if (debugYouTube) {
        console.debug("[yt] switching video via IFrame API", {
          targetId,
          videoState,
          normalizedUrl,
          currentId,
        });
      }

      let attempts = 0;

      const requestSwitch = () => {
        attempts += 1;
        try {
          if (videoState === "Playing") {
            (internal.loadVideoById ?? internal.cueVideoById)?.(targetId);
          } else {
            (internal.cueVideoById ?? internal.loadVideoById)?.(targetId);
          }
        } catch (e) {
          if (debugYouTube) {
            console.debug("[yt] loadVideoById/cueVideoById failed", e);
          }
        }
      };

      const verifyAndMaybeRetry = () => {
        if (cancelled) return;

        const nowId = getInternalCurrentVideoId(internal);

        if (debugYouTube) {
          console.debug("[yt] verify", {
            targetId,
            nowId,
            attempts,
            videoState,
          });
        }

        if (nowId === targetId) {
          ytConfirmedIdRef.current = targetId;
          setYtConfirmedId(targetId);
          setPlayerReady(true);
          setPlayerError(null);
          setIsBuffering(false);
          clearLoadTimeout();
          // Only kick play once the *target* is actually loaded.
          if (videoState === "Playing") {
            try {
              suppressNextPlayBroadcast(2000);
              internal.playVideo?.();
            } catch {
              // ignore
            }
          }
          return;
        }

        if (attempts >= 6) {
          // Internal switching sometimes fails (autoplay policy / transient YT
          // issues). As a last resort, force-remount the iframe to the new URL.
          // This restores manual switching reliability.
          if (ytLastForcedRemountIdRef.current !== targetId) {
            ytLastForcedRemountIdRef.current = targetId;
            if (debugYouTube) {
              console.debug(
                "[yt] forcing iframe remount after failed switches",
                {
                  targetId,
                  normalizedUrl,
                  attempts,
                },
              );
            }
            // Only update if it would actually change.
            setYoutubeMountUrl((prev) =>
              prev === normalizedUrl ? prev : normalizedUrl,
            );
          }
          return;
        }

        requestSwitch();
        retryTimer = window.setTimeout(verifyAndMaybeRetry, 500);
      };

      requestSwitch();
      retryTimer = window.setTimeout(verifyAndMaybeRetry, 500);
    };

    tryLoad();

    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [
    isClient,
    isYouTube,
    normalizedUrl,
    playerRef,
    videoState,
    debugYouTube,
    useYouTubeIFrameApi,
    ytConfirmedId,
    ytConfirmedIdRef,
    ytRequestedIdRef,
    setYtConfirmedId,
    setPlayerReady,
    setPlayerError,
    setIsBuffering,
    clearLoadTimeout,
    suppressNextPlayBroadcast,
    ytLastForcedRemountIdRef,
    setYoutubeMountUrl,
  ]);
}
