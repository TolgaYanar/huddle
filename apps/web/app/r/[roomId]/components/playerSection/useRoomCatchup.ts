import * as React from "react";

import {
  getCurrentTimeFromRef,
  playFromRef,
  seekToFromRef,
} from "../../lib/player";
import { USER_PAUSE_INTENT_WINDOW_MS } from "../../hooks/useVideoPlayer/constants";

export type RoomPlaybackAnchor = {
  url: string;
  isPlaying: boolean;
  anchorTime: number;
  anchorAt: number;
  playbackRate: number;
};

type PendingRoomCatchup = {
  target: number;
  until: number;
  attempts: number;
};

type UseRoomCatchupParams = {
  isClient: boolean;
  playerReady: boolean;
  normalizedUrl: string;
  duration: number;
  videoState: string;
  roomPlaybackAnchorVersion: number;

  playerRef: React.RefObject<unknown>;
  applyingRemoteSyncRef: React.MutableRefObject<boolean>;
  roomPlaybackAnchorRef: React.MutableRefObject<RoomPlaybackAnchor | null>;
  lastManualSeekRef: React.MutableRefObject<number>;
  lastUserPauseAtRef: React.MutableRefObject<number>;

  suppressNextPlayBroadcast: (ms?: number) => void;
  suppressNextSeekBroadcast: (ms?: number) => void;
  handlePlay: () => void;
  handleSeekTo: (time: number, opts?: { force?: boolean }) => void;
};

export function useRoomCatchup({
  isClient,
  playerReady,
  normalizedUrl,
  duration,
  videoState,
  roomPlaybackAnchorVersion,
  playerRef,
  applyingRemoteSyncRef,
  roomPlaybackAnchorRef,
  lastManualSeekRef,
  lastUserPauseAtRef,
  suppressNextPlayBroadcast,
  suppressNextSeekBroadcast,
  handlePlay,
  handleSeekTo,
}: UseRoomCatchupParams) {
  const lastRoomSyncAtRef = React.useRef(0);

  const pendingRoomCatchupRef = React.useRef<PendingRoomCatchup | null>(null);
  const resumeCatchupAfterPauseTimeoutRef = React.useRef<number | null>(null);
  const resumeSyncAfterPauseTimeoutRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (resumeCatchupAfterPauseTimeoutRef.current) {
        window.clearTimeout(resumeCatchupAfterPauseTimeoutRef.current);
        resumeCatchupAfterPauseTimeoutRef.current = null;
      }
      if (resumeSyncAfterPauseTimeoutRef.current) {
        window.clearTimeout(resumeSyncAfterPauseTimeoutRef.current);
        resumeSyncAfterPauseTimeoutRef.current = null;
      }
    };
  }, []);

  const cancelPendingRoomCatchup = React.useCallback(() => {
    pendingRoomCatchupRef.current = null;

    if (resumeCatchupAfterPauseTimeoutRef.current) {
      window.clearTimeout(resumeCatchupAfterPauseTimeoutRef.current);
      resumeCatchupAfterPauseTimeoutRef.current = null;
    }
  }, []);

  const tryApplyPendingRoomCatchup = React.useCallback(() => {
    const pending = pendingRoomCatchupRef.current;
    if (!pending) return;

    // Drop if expired.
    if (Date.now() > pending.until || pending.attempts >= 10) {
      pendingRoomCatchupRef.current = null;
      return;
    }

    // If user explicitly paused recently, don't auto-resume - respect their intent
    const userPausedRecently =
      Date.now() - lastUserPauseAtRef.current < USER_PAUSE_INTENT_WINDOW_MS;
    if (userPausedRecently) {
      if (!resumeCatchupAfterPauseTimeoutRef.current) {
        const remaining =
          USER_PAUSE_INTENT_WINDOW_MS -
          Math.max(0, Date.now() - lastUserPauseAtRef.current);
        resumeCatchupAfterPauseTimeoutRef.current = window.setTimeout(
          () => {
            resumeCatchupAfterPauseTimeoutRef.current = null;
            tryApplyPendingRoomCatchup();
          },
          Math.max(0, remaining) + 50,
        );
      }
      return;
    }

    const current = getCurrentTimeFromRef(playerRef);
    const drift = Math.abs(current - pending.target);

    // If we've landed close enough, we're done.
    if (drift <= 2.5 || (current > 3 && pending.target > 5)) {
      pendingRoomCatchupRef.current = null;
      return;
    }

    pending.attempts += 1;

    applyingRemoteSyncRef.current = true;
    window.setTimeout(() => {
      applyingRemoteSyncRef.current = false;
    }, 350);

    suppressNextSeekBroadcast(3000);
    seekToFromRef(playerRef, pending.target);

    // YouTube sometimes ignores ReactPlayer.seekTo until the internal player is fully cued.
    // Calling the internal API improves reliability.
    try {
      const wrapper = playerRef.current as
        | {
            getInternalPlayer?: () => unknown;
          }
        | null
        | undefined;
      const internal = wrapper?.getInternalPlayer?.() as
        | {
            seekTo?: (seconds: number, allowSeekAhead?: boolean) => void;
            playVideo?: () => void;
          }
        | null
        | undefined;
      internal?.seekTo?.(pending.target, true);

      // Intentionally do NOT force play() here.
      // For some providers (YouTube/ReactPlayer), forcing play during repeated
      // catchup retries can create multi-second windows where user pause/seek
      // feels "ignored" because controlled state and catchup fight each other.
    } catch {
      // ignore
    }

    // Retry shortly; this covers the period where the iframe exists but isn't seekable yet.
    window.setTimeout(() => {
      tryApplyPendingRoomCatchup();
    }, 350);
  }, [
    applyingRemoteSyncRef,
    lastUserPauseAtRef,
    playerRef,
    suppressNextSeekBroadcast,
  ]);

  const syncToRoomTimeIfNeeded = React.useCallback(() => {
    const anchor = roomPlaybackAnchorRef.current;
    if (!anchor) return;

    // Only try to resume if we're on the same media URL.
    if (anchor.url !== normalizedUrl) return;

    // Don't override user's explicit pause for a short window
    const userPausedRecently =
      Date.now() - lastUserPauseAtRef.current < USER_PAUSE_INTENT_WINDOW_MS;
    if (userPausedRecently) {
      if (!resumeSyncAfterPauseTimeoutRef.current) {
        const remaining =
          USER_PAUSE_INTENT_WINDOW_MS -
          Math.max(0, Date.now() - lastUserPauseAtRef.current);
        resumeSyncAfterPauseTimeoutRef.current = window.setTimeout(
          () => {
            resumeSyncAfterPauseTimeoutRef.current = null;
            syncToRoomTimeIfNeeded();
          },
          Math.max(0, remaining) + 50,
        );
      }
      return;
    }

    // Don't override user's manual seek for 5 seconds
    const timeSinceManualSeek = Date.now() - lastManualSeekRef.current;
    if (timeSinceManualSeek < 5000) return;

    // Throttle automatic sync to avoid oscillations.
    const now = Date.now();
    if (now - lastRoomSyncAtRef.current < 900) return;

    const current = getCurrentTimeFromRef(playerRef);

    // Calculate expected position based on anchor - use full elapsed time for proper sync
    const elapsedSeconds = anchor.isPlaying
      ? Math.max(0, (Date.now() - anchor.anchorAt) / 1000)
      : 0;
    const expected =
      anchor.anchorTime + elapsedSeconds * (anchor.playbackRate || 1);
    const target = Math.max(0, Math.min(expected, duration || Infinity));

    const drift = Math.abs(current - target);

    // ALWAYS sync if we're at the beginning (< 3 sec) but should be much further (> 5 sec ahead)
    // This handles the case where player loads after room state arrived
    const atBeginning = current < 3;
    const shouldBeFarAhead = target > 5;

    if (atBeginning && shouldBeFarAhead) {
      // Initial load - player wasn't seekable when room state arrived, keep retrying briefly.
      lastRoomSyncAtRef.current = Date.now();
      pendingRoomCatchupRef.current = {
        target,
        until: Date.now() + 4000,
        attempts: 0,
      };
      tryApplyPendingRoomCatchup();
      return;
    }

    // For normal cases, only sync if drift is significant
    if (drift <= 3) return;

    // Avoid redundant seeks if we just synced
    const timeSinceAnchor = Date.now() - anchor.anchorAt;
    if (timeSinceAnchor < 1000 && drift < 5) return;

    applyingRemoteSyncRef.current = true;
    window.setTimeout(() => {
      applyingRemoteSyncRef.current = false;
    }, 350);

    lastRoomSyncAtRef.current = Date.now();
    suppressNextSeekBroadcast(2500);
    seekToFromRef(playerRef, target);
  }, [
    applyingRemoteSyncRef,
    duration,
    lastManualSeekRef,
    lastUserPauseAtRef,
    normalizedUrl,
    tryApplyPendingRoomCatchup,
    playerRef,
    roomPlaybackAnchorRef,
    suppressNextSeekBroadcast,
    // lastRoomSyncAtRef is a ref; intentionally omitted.
  ]);

  // Late-joiner fix: room_state often arrives before the player has loaded the
  // correct URL. Once the player is ready (and when URL/state changes), sync to
  // the room anchor if we're clearly behind.
  React.useEffect(() => {
    if (!isClient) return;
    if (!playerReady) return;
    const id = window.setTimeout(() => {
      syncToRoomTimeIfNeeded();
    }, 50);
    return () => {
      window.clearTimeout(id);
    };
  }, [
    isClient,
    playerReady,
    normalizedUrl,
    videoState,
    roomPlaybackAnchorVersion,
    syncToRoomTimeIfNeeded,
  ]);

  // If the room is already playing, a late joiner may need a user gesture to
  // start playback (autoplay policies). When they click Play, ensure we first
  // catch up to the room anchor, and avoid broadcasting an extra "play" event.
  const handlePlayWithRoomCatchup = React.useCallback(() => {
    // Clear user pause intent - user explicitly wants to play now
    lastUserPauseAtRef.current = 0;

    const anchor = roomPlaybackAnchorRef.current;
    const isSameUrl = !!anchor && anchor.url === normalizedUrl;
    // If we don't yet have a usable room anchor (common on fast clicks during join),
    // treat Play as local-only so we don't accidentally broadcast stale 0:00.
    const shouldBroadcastPlay = isSameUrl && anchor?.isPlaying === false;

    syncToRoomTimeIfNeeded();

    if (!shouldBroadcastPlay) {
      // Treat as local-only resume (room already playing, or room_state not ready).
      suppressNextPlayBroadcast(2500);
    }

    handlePlay();

    // Best-effort immediate start within the user gesture.
    // This helps with autoplay policies where state-driven play may be blocked.
    try {
      const wrapper = playerRef.current as
        | {
            getInternalPlayer?: () => unknown;
          }
        | null
        | undefined;
      const internal = wrapper?.getInternalPlayer?.() as
        | {
            playVideo?: () => void;
          }
        | null
        | undefined;

      if (internal?.playVideo) {
        internal.playVideo();
      } else {
        void playFromRef(playerRef);
      }
    } catch {
      // ignore
    }
  }, [
    handlePlay,
    lastUserPauseAtRef,
    normalizedUrl,
    playerRef,
    roomPlaybackAnchorRef,
    suppressNextPlayBroadcast,
    syncToRoomTimeIfNeeded,
  ]);

  // Manual seeks (UI progress bar / user gestures) should ALWAYS win.
  // They must bypass suppression windows and also cancel any in-flight
  // late-join catch-up retries so the user doesn't get snapped back.
  const handleUserSeek = React.useCallback(
    (time: number) => {
      lastManualSeekRef.current = Date.now();
      cancelPendingRoomCatchup();
      handleSeekTo(time, { force: true });
    },
    [cancelPendingRoomCatchup, handleSeekTo, lastManualSeekRef],
  );

  return {
    cancelPendingRoomCatchup,
    handlePlayWithRoomCatchup,
    handleUserSeek,
    syncToRoomTimeIfNeeded,
    tryApplyPendingRoomCatchup,
  };
}
