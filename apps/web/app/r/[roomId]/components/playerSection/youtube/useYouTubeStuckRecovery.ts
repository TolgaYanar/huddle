import * as React from "react";

import {
  getInternalCurrentVideoId,
  getInternalPlayerFromRef,
} from "./internal";

export function useYouTubeStuckRecovery({
  isClient,
  isYouTube,
  isPageVisible,
  videoState,
  youTubeIsOnDesired,
  youTubeDesiredId,
  ytConfirmedId,
  normalizedUrl,
  useYouTubeIFrameApi,
  ytUseStableIframe,
  canPlay,
  playerSrc,
  playerRef,
  setPlayerReady,
  setIsBuffering,
  setYoutubeMountUrl,
  setYtForceRemountNonce,
  ytRequestedIdRef,
  ytConfirmedIdRef,
  setYtConfirmedId,
  ytLastForcedRemountIdRef,
  ytVisibleStuckRemountIdRef,
  ytVisibleStuckAttemptsRef,
  setYtUseStableIframe,
}: {
  isClient: boolean;
  isYouTube: boolean;
  isPageVisible: boolean;
  videoState: string;
  youTubeIsOnDesired: boolean;
  youTubeDesiredId: string | null;
  ytConfirmedId: string | null;
  normalizedUrl: string;
  useYouTubeIFrameApi: boolean;
  ytUseStableIframe: boolean;
  canPlay: boolean;
  playerSrc: string;
  playerRef: React.RefObject<unknown>;
  setPlayerReady: React.Dispatch<React.SetStateAction<boolean>>;
  setIsBuffering: React.Dispatch<React.SetStateAction<boolean>>;
  setYoutubeMountUrl: React.Dispatch<React.SetStateAction<string | null>>;
  setYtForceRemountNonce: React.Dispatch<React.SetStateAction<number>>;
  ytRequestedIdRef: React.MutableRefObject<string | null>;
  ytConfirmedIdRef: React.MutableRefObject<string | null>;
  setYtConfirmedId: React.Dispatch<React.SetStateAction<string | null>>;
  ytLastForcedRemountIdRef: React.MutableRefObject<string | null>;
  ytVisibleStuckRemountIdRef: React.MutableRefObject<string | null>;
  ytVisibleStuckAttemptsRef: React.MutableRefObject<number>;
  setYtUseStableIframe: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  // If we're visible and the room is "Playing" but the player isn't on the
  // desired YouTube id, ReactPlayer will keep itself paused (by design). That
  // pause can cascade into handlePause() and permanently wedge controls.
  // In that state, force-remount once per target id to recover.
  React.useEffect(() => {
    if (!isClient) return;
    if (!isYouTube) return;
    if (useYouTubeIFrameApi) return;
    if (!ytUseStableIframe) return;
    if (!isPageVisible) return;
    if (videoState !== "Playing") return;
    if (youTubeIsOnDesired) {
      ytVisibleStuckRemountIdRef.current = null;
      ytVisibleStuckAttemptsRef.current = 0;
      return;
    }

    const targetId = youTubeDesiredId;
    if (!targetId) return;
    if (ytVisibleStuckRemountIdRef.current === targetId) return;

    let cancelled = false;
    let timer: number | null = null;

    const probe = () => {
      if (cancelled) return;
      if (videoState !== "Playing") return;
      if (ytConfirmedId === targetId) return;

      const internal = getInternalPlayerFromRef(playerRef);
      const internalPresent = Boolean(internal);

      const nowId = internal ? getInternalCurrentVideoId(internal) : null;

      // If internal isn't ready yet, keep probing briefly instead of forcing a remount.
      if (!internalPresent) {
        ytVisibleStuckAttemptsRef.current += 1;
        if (ytVisibleStuckAttemptsRef.current < 30) {
          timer = window.setTimeout(probe, 350);
          return;
        }

        // The player hasn't even exposed its internal API yet.
        // If this persists, stable-iframe mode is not viable in this session.
        // Fall back to legacy remount-per-URL behavior so playback can proceed.
        if (ytUseStableIframe) {
          console.warn(
            "[yt] stable iframe mode failed; falling back to remount mode",
            {
              targetId,
              normalizedUrl,
              attempts: ytVisibleStuckAttemptsRef.current,
            },
          );
          setYtUseStableIframe(false);
          setYtForceRemountNonce((n) => n + 1);
          ytVisibleStuckAttemptsRef.current = 0;
          return;
        }

        // Otherwise, back off and try again later.
        console.warn(
          "[yt] internal player not available yet; delaying recovery",
          {
            targetId,
            normalizedUrl,
            canPlay,
            playerSrc,
            attempts: ytVisibleStuckAttemptsRef.current,
          },
        );
        ytVisibleStuckAttemptsRef.current = 0;
        timer = window.setTimeout(probe, 2000);
        return;
      }

      // If a switch request is in-flight, give it more time before remounting.
      const switchInProgress =
        ytRequestedIdRef.current === targetId && ytConfirmedId !== targetId;
      if (switchInProgress) {
        ytVisibleStuckAttemptsRef.current += 1;
        if (ytVisibleStuckAttemptsRef.current < 12) {
          timer = window.setTimeout(probe, 450);
          return;
        }
      }

      ytVisibleStuckRemountIdRef.current = targetId;
      ytLastForcedRemountIdRef.current = targetId;

      // Reset confirmation and force an actual remount.
      ytRequestedIdRef.current = null;
      ytConfirmedIdRef.current = null;
      setYtConfirmedId(null);
      setPlayerReady(false);
      setIsBuffering(true);
      setYoutubeMountUrl(normalizedUrl);
      setYtForceRemountNonce((n) => n + 1);

      console.warn(
        "[yt] stuck not on desired id while Playing; forcing remount",
        {
          targetId,
          nowId,
          internalPresent,
          normalizedUrl,
        },
      );
    };

    ytVisibleStuckAttemptsRef.current = 0;
    timer = window.setTimeout(probe, 900);

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [
    isClient,
    isYouTube,
    isPageVisible,
    videoState,
    youTubeIsOnDesired,
    youTubeDesiredId,
    ytConfirmedId,
    normalizedUrl,
    useYouTubeIFrameApi,
    ytUseStableIframe,
    canPlay,
    playerSrc,
    playerRef,
    setPlayerReady,
    setIsBuffering,
    setYoutubeMountUrl,
    setYtForceRemountNonce,
    ytRequestedIdRef,
    ytConfirmedIdRef,
    setYtConfirmedId,
    ytLastForcedRemountIdRef,
    ytVisibleStuckRemountIdRef,
    ytVisibleStuckAttemptsRef,
    setYtUseStableIframe,
  ]);
}
