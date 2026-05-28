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
    // Two very different cases produce this mismatch:
    //
    //   A. FIRST room_state after a fresh connect — we just started up on
    //      /watch/<X> after the user navigated Netflix from /watch/<old>
    //      via Browse/Home/episodes (during which our content script was
    //      unloaded since the manifest only matches /watch/*). The user
    //      EXPECTS the room to follow them to /watch/<X>.
    //
    //   B. Subsequent room_state — we were happily synced and the room
    //      moved out from under us (host clicked Next Episode, etc.).
    //      The user EXPECTS to follow the room to its new URL.
    //
    // We can tell them apart with hasAppliedRoomStateSinceConnect.
    const targetUrl = roomState.videoUrl ?? "";
    const isNetflixWatchUrl = /^https:\/\/www\.netflix\.com\/watch\//i.test(
      targetUrl,
    );
    const recentlyNavigatedToSame =
      state.lastAutoNavigatedTo === targetUrl &&
      Date.now() - state.lastAutoNavigatedAt < 5000;

    if (!state.hasAppliedRoomStateSinceConnect) {
      // Case A: broadcast OUR url so the room follows us. Without this the
      // user gets bounced back to the previous title every time they pick
      // something new — the "navigate to different content and the
      // extension keeps yanking me back" bug.
      const currentUrl = location.href;
      if (/^https:\/\/www\.netflix\.com\/watch\//i.test(currentUrl)) {
        state.lastLocalEmitAt = Date.now();
        state.lastLocalEmitAction = "change_url";
        state.lastLocalEmitTimestamp = 0;
        // Mark the flag BEFORE emitting so the echo doesn't re-trigger
        // this branch.
        state.hasAppliedRoomStateSinceConnect = true;
        state.lastCatchUpNote = `Updating room to /watch/${actualWatchId}…`;
        updateOverlay();
        if (state.socket?.connected && state.currentRoomId) {
          state.socket.emit("sync_video", {
            roomId: state.currentRoomId,
            action: "change_url",
            timestamp: 0,
            videoUrl: currentUrl,
          });
        }
        return;
      }
      // We're on a non-watch URL (shouldn't normally happen — manifest
      // gates us — but defensive). Fall through to the passive hint.
    } else if (isNetflixWatchUrl && !recentlyNavigatedToSame) {
      // Case B: the room moved while we were watching — follow it.
      state.lastAutoNavigatedTo = targetUrl;
      state.lastAutoNavigatedAt = Date.now();
      state.lastCatchUpNote = `Following room to /watch/${expectedWatchId}…`;
      updateOverlay();
      window.location.assign(targetUrl);
      return;
    }

    // Either the target isn't a watch URL or we just navigated; fall back
    // to the passive hint behaviour.
    state.lastWatchIdMismatch = {
      expected: expectedWatchId,
      actual: actualWatchId,
    };
    updateOverlay();
    return;
  }

  // No mismatch (or it was just resolved) — record that we've now seen at
  // least one usable room_state on this connection.
  state.hasAppliedRoomStateSinceConnect = true;

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

        // Echo-of-our-own-action guard: if we emitted a seek (or any sync)
        // in the last 2.5 s and the snapshot timestamp is close to what we
        // just sent, this room_state is the server echoing our own gesture
        // back at us — possibly with a slight extrapolation forward because
        // isPlaying=true. Don't re-seek; trust where the user actually
        // landed. Without this, the Netflix scrubber felt sticky: the
        // user's click would land at T, the echo would arrive at T+0.3s,
        // drift would tip past 1.0s, and we'd snap the player back.
        const sinceLocalEmit = Date.now() - state.lastLocalEmitAt;
        const isOwnEcho =
          sinceLocalEmit < 2500 &&
          state.lastLocalEmitTimestamp !== null &&
          Math.abs(desiredTime - state.lastLocalEmitTimestamp) < 3.0;

        if (drift > 1.0 && !isOwnEcho) {
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
  attachVideoListeners(state, { emitSync, shouldEmitLocalSync });

  // Keep observing forever — previously this disconnected once the initial
  // <video> was found, which meant Netflix's "Next episode" / autoplay
  // navigation (the video element gets replaced, not refreshed) left our
  // listeners bound to a detached node and sync silently stopped. The
  // observer is cheap because attachVideoListeners is idempotent: it
  // short-circuits when the current element matches state.listenersAttachedTo.
  const obs = new MutationObserver(() => {
    attachVideoListeners(state, { emitSync, shouldEmitLocalSync });
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });

  // SPA-nav fallback: even when the DOM doesn't change in a way the
  // MutationObserver above catches (e.g. Netflix uses replaceState), the
  // URL changes. Patch history to fire a custom event we listen for so we
  // can re-check after every client-side nav.
  const origPush = history.pushState.bind(history);
  const origReplace = history.replaceState.bind(history);
  history.pushState = (...args: Parameters<typeof history.pushState>) => {
    const r = origPush(...args);
    window.dispatchEvent(new Event("huddle:locationchange"));
    return r;
  };
  history.replaceState = (...args: Parameters<typeof history.replaceState>) => {
    const r = origReplace(...args);
    window.dispatchEvent(new Event("huddle:locationchange"));
    return r;
  };
  window.addEventListener("popstate", () =>
    window.dispatchEvent(new Event("huddle:locationchange")),
  );
  // When our own location changes (Next-episode autoplay or explicit
  // navigation), broadcast it so the rest of the room follows. Without this
  // the host could move to /watch/<next> and every other member would stay
  // stuck on the previous episode. Throttled per-URL so Netflix's hash
  // changes during a single watch don't spam emits.
  let lastEmittedUrl: string | null = null;
  const maybeBroadcastUrlChange = () => {
    if (!shouldEmitLocalSync()) return;
    const url = location.href;
    if (url === lastEmittedUrl) return;
    if (!/^https:\/\/www\.netflix\.com\/watch\//i.test(url)) return;
    lastEmittedUrl = url;
    // Stamp the local emit so applyRoomStateToVideo treats the echo as our
    // own (mirrors the play/pause/seek path).
    state.lastLocalEmitAt = Date.now();
    state.lastLocalEmitAction = "change_url";
    state.lastLocalEmitTimestamp = 0;
    // emitSync includes location.href automatically on every emit, so the
    // server will see the new URL and update the room's videoUrl.
    emitSync("change_url", 0);
  };

  window.addEventListener("huddle:locationchange", () => {
    maybeBroadcastUrlChange();
    attachVideoListeners(state, { emitSync, shouldEmitLocalSync });
  });
}

export function shouldApplyFollow() {
  return followEnabled;
}
