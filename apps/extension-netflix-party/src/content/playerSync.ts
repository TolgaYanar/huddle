import type { ContentState } from "./state";
import type { RoomState } from "./types";
import { autoPlayPauseEnabled, followEnabled, seekEnabled } from "./constants";
import {
  safeNetflixSeekViaBackground,
  safeNetflixSetPlayingViaBackground,
} from "./netflixBackground";
import { debugLog } from "./log";
import {
  getBestVideo,
  computeDesiredTimestampNow,
  getNetflixWatchIdFromUrl,
  getLocalWatchId,
} from "./video";
import { isLikelyEchoEvent, withRemoteGuard } from "./syncUtils";

export function stopPlayPausePoll(state: ContentState) {
  if (state.playPausePollTimer !== null) {
    window.clearInterval(state.playPausePollTimer);
    state.playPausePollTimer = null;
  }
  state.lastLocalPaused = null;
}

export function startPlayPausePoll(
  state: ContentState,
  {
    emitSync,
    shouldEmitLocalSync,
  }: {
    emitSync: (action: string, timestamp?: number) => void;
    shouldEmitLocalSync: () => boolean;
  },
) {
  if (state.playPausePollTimer !== null) return;

  state.playPausePollTimer = window.setInterval(() => {
    const v = getBestVideo();
    if (!v) return;

    const paused = Boolean(v.paused);
    if (state.lastLocalPaused === null) {
      state.lastLocalPaused = paused;
      return;
    }

    if (paused === state.lastLocalPaused) return;

    const action = paused ? "pause" : "play";
    const timestamp = Number.isFinite(v.currentTime)
      ? v.currentTime
      : undefined;

    // Always update our local snapshot so we don't emit later.
    state.lastLocalPaused = paused;

    if (state.isApplyingRemote) return;
    if (!shouldEmitLocalSync()) return;
    if (
      typeof timestamp === "number" &&
      isLikelyEchoEvent(state, action, timestamp)
    )
      return;

    // For play, Netflix may require a user gesture on the *local* tab.
    if (action === "play" && !state.hasUserGesture) return;

    emitSync(action, timestamp);
  }, 500);
}

export function recordPendingRoomState(
  state: ContentState,
  roomState: RoomState,
) {
  state.pendingRoomState = roomState;

  const v = getBestVideo();
  const t = computeDesiredTimestampNow(roomState);
  if (v && t !== null && Number.isFinite(v.currentTime)) {
    state.pendingDriftSeconds = v.currentTime - t;
  } else {
    state.pendingDriftSeconds = null;
  }
}

export function applyRoomStateToVideo(
  state: ContentState,
  roomState: RoomState,
  {
    updateOverlay,
  }: {
    updateOverlay: () => void;
  },
  opts?: { manual?: boolean },
) {
  if (!seekEnabled && !autoPlayPauseEnabled) return;

  const v = getBestVideo();
  if (!v) return;

  // Avoid hammering the player; Netflix can be sensitive to rapid seek/play.
  const now = Date.now();
  if (now - state.lastRemoteApplyAt < 250) return;

  const expectedWatchId =
    typeof roomState.videoUrl === "string"
      ? getNetflixWatchIdFromUrl(roomState.videoUrl)
      : null;
  const actualWatchId = getLocalWatchId();
  if (expectedWatchId && actualWatchId && expectedWatchId !== actualWatchId) {
    state.lastWatchIdMismatch = {
      expected: expectedWatchId,
      actual: actualWatchId,
    };
    updateOverlay();
    return;
  }

  if (state.lastWatchIdMismatch) {
    state.lastWatchIdMismatch = null;
    updateOverlay();
  }

  const rev = typeof roomState.rev === "number" ? roomState.rev : 0;
  if (rev && rev < state.lastAppliedRev) return;
  if (rev) state.lastAppliedRev = rev;

  const desiredTime = computeDesiredTimestampNow(roomState);
  const desiredPlaying = roomState.isPlaying === true;
  const desiredRate =
    typeof roomState.playbackSpeed === "number"
      ? roomState.playbackSpeed
      : null;

  withRemoteGuard(
    state,
    () => {
      if (desiredRate && Math.abs(v.playbackRate - desiredRate) > 0.01) {
        v.playbackRate = desiredRate;
        state.lastRemoteApplyAt = Date.now();
      }

      if (v.readyState < 1 || !Number.isFinite(v.duration) || v.duration <= 0) {
        return;
      }

      if (seekEnabled && desiredTime !== null && Number.isFinite(desiredTime)) {
        const drift = Math.abs(v.currentTime - desiredTime);
        if (drift > 1.0) {
          if (!state.hasUserGesture) return;

          state.lastCatchUpNote = `Syncing to ${desiredTime.toFixed(1)}s…`;
          updateOverlay();

          state.lastRemoteAction = "seek";
          state.lastRemoteTimestamp = desiredTime;
          state.lastRemoteApplyAt = Date.now();

          void safeNetflixSeekViaBackground(desiredTime).then((res) => {
            state.lastCatchUpNote = res.ok
              ? null
              : `Seek failed: ${res.error || "unknown"}`;
            updateOverlay();
          });
          return;
        }
      }

      if (desiredPlaying) {
        if (v.paused) {
          if (!autoPlayPauseEnabled) return;
          if (!state.hasUserGesture) {
            state.pendingPlayOnGesture = true;
            state.lastCatchUpNote = "Click anywhere to resume playback.";
            updateOverlay();
            return;
          }

          state.lastRemoteAction = "play";
          state.lastRemoteTimestamp = v.currentTime;
          state.lastRemoteApplyAt = Date.now();

          void safeNetflixSetPlayingViaBackground(true).then((res) => {
            state.lastCatchUpNote = res.ok
              ? null
              : `Play failed: ${res.error || "unknown"}`;
            updateOverlay();
          });
        }
      } else {
        if (!v.paused) {
          if (!autoPlayPauseEnabled) return;
          state.lastRemoteAction = "pause";
          state.lastRemoteTimestamp = v.currentTime;
          state.lastRemoteApplyAt = Date.now();
          v.pause();
        }
      }
    },
    1000,
  );

  if (opts?.manual) {
    // left for parity/extensibility
  }
}

export function attachVideoListeners(
  state: ContentState,
  {
    emitSync,
    shouldEmitLocalSync,
  }: {
    emitSync: (action: string, timestamp?: number) => void;
    shouldEmitLocalSync: () => boolean;
  },
) {
  const v = getBestVideo();
  if (!v) return false;
  if (state.listenersAttachedTo === v) return true;

  const canEmitFromGesture = (windowMs: number) =>
    Date.now() - state.lastUserGestureAt < windowMs;
  const canEmitNow = (
    action: string,
    timestamp: number,
    gestureWindowMs: number,
  ) => {
    if (state.isApplyingRemote) return false;
    if (!shouldEmitLocalSync()) return false;
    const hasRecentGesture = canEmitFromGesture(gestureWindowMs);
    if (hasRecentGesture) return true;
    if (isLikelyEchoEvent(state, action, timestamp)) return false;
    return true;
  };

  const onPlay = () => {
    if (!canEmitNow("play", v.currentTime, 10000)) return;
    emitSync("play", v.currentTime);
  };

  const onPause = () => {
    if (!canEmitNow("pause", v.currentTime, 10000)) return;
    emitSync("pause", v.currentTime);
  };

  const onSeeked = () => {
    if (!canEmitNow("seek", v.currentTime, 15000)) return;
    emitSync("seek", v.currentTime);
  };

  const onRate = () => {
    if (state.isApplyingRemote) return;
    if (!shouldEmitLocalSync()) return;
    const s = state.socket;
    const roomId = state.currentRoomId;
    if (!s || !roomId) return;
    s.emit("sync_video", {
      roomId,
      action: "set_speed",
      timestamp: v.currentTime,
      playbackSpeed: v.playbackRate,
      videoUrl: location.href,
    });
  };

  v.addEventListener("play", onPlay);
  v.addEventListener("pause", onPause);
  v.addEventListener("seeked", onSeeked);
  v.addEventListener("ratechange", onRate);

  state.listenersAttachedTo = v;

  debugLog("attached video listeners");
  return true;
}

export function ensureVideoListeners(
  state: ContentState,
  {
    emitSync,
    shouldEmitLocalSync,
  }: {
    emitSync: (action: string, timestamp?: number) => void;
    shouldEmitLocalSync: () => boolean;
  },
) {
  if (attachVideoListeners(state, { emitSync, shouldEmitLocalSync })) return;

  const obs = new MutationObserver(() => {
    if (attachVideoListeners(state, { emitSync, shouldEmitLocalSync })) {
      obs.disconnect();
    }
  });

  obs.observe(document.documentElement, { childList: true, subtree: true });
}

export function shouldApplyFollow() {
  return followEnabled;
}
