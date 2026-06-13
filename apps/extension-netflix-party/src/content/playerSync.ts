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
  isNetflixWatchUrl,
} from "./video";
import { isLikelyEchoEvent, withRemoteGuard } from "./syncUtils";

// True only when the room is known to be watching a Netflix /watch URL.
// Gates local gesture emits (play/pause/seek/set_speed) so a Netflix tab
// can't inject playback into a non-Netflix room. Returns false when we
// don't yet know the room's URL — gestures stay local until the first
// room_state confirms the room is on Netflix. (change_url is NOT gated: it
// is exactly how a room transitions TO Netflix.)
export function roomIsOnNetflix(state: ContentState): boolean {
  return state.lastKnownRoomVideoUrl === null
    ? false
    : isNetflixWatchUrl(state.lastKnownRoomVideoUrl);
}

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
    // Don't inject local play/pause into a room that isn't on Netflix.
    if (!roomIsOnNetflix(state)) return;
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
  state.pendingRoomStateReceivedAt = Date.now();

  // Learn the room's authoritative videoUrl whenever a snapshot carries one.
  // Full room_state always includes it; receive_sync may omit it, in which
  // case we keep the last value rather than clobbering it with null.
  if (typeof roomState.videoUrl === "string") {
    state.lastKnownRoomVideoUrl = roomState.videoUrl;
  }

  const v = getBestVideo();
  const t = computeDesiredTimestampNow(
    roomState,
    state.pendingRoomStateReceivedAt,
  );
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

  // If the room is watching something that isn't Netflix (e.g. a YouTube
  // room), do NOT touch the local Netflix video. expectedWatchId would be
  // null below, the mismatch branch would be skipped, and the room's
  // timestamps/play/pause would be applied to our unrelated Netflix video —
  // and local gestures would echo back, compounding the hijack. Bail with a
  // passive note instead. When the room URL is still unknown (null) we fall
  // through to preserve best-effort behaviour for brand-new rooms.
  const effectiveRoomUrl =
    (typeof roomState.videoUrl === "string" ? roomState.videoUrl : null) ??
    state.lastKnownRoomVideoUrl;
  if (effectiveRoomUrl !== null && !isNetflixWatchUrl(effectiveRoomUrl)) {
    state.lastCatchUpNote = "Room is watching something else";
    updateOverlay();
    return;
  }

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
    const targetIsNetflixWatch = isNetflixWatchUrl(targetUrl);
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
    } else if (targetIsNetflixWatch && !recentlyNavigatedToSame) {
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

  const desiredTime = computeDesiredTimestampNow(
    roomState,
    state.pendingRoomStateReceivedAt,
  );
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
            if (res.ok) {
              // The background seek resolves asynchronously; lastRemoteApplyAt
              // was stamped before the await, so by the time the resulting
              // `seeked` event fires the 1.5s echo window may already have
              // lapsed and the echo leaks back out as a "user seek". Re-stamp
              // now so the echo window starts when the seek actually lands.
              state.lastRemoteAction = "seek";
              state.lastRemoteTimestamp = desiredTime;
              state.lastRemoteApplyAt = Date.now();
            }
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

  const canEmitNow = (action: string, timestamp: number) => {
    if (state.isApplyingRemote) return false;
    if (!shouldEmitLocalSync()) return false;
    // Don't inject local play/pause/seek into a room that isn't on Netflix.
    if (!roomIsOnNetflix(state)) return false;
    // Suppress echoes of a remote-applied action. This must run BEFORE we
    // treat the event as user-initiated: a remote seek that lands shortly
    // after a user gesture would otherwise be re-broadcast as a user seek
    // (feedback loop). Anything past this guard is a genuine local action.
    if (isLikelyEchoEvent(state, action, timestamp)) return false;
    return true;
  };

  const onPlay = () => {
    if (!canEmitNow("play", v.currentTime)) return;
    emitSync("play", v.currentTime);
  };

  const onPause = () => {
    if (!canEmitNow("pause", v.currentTime)) return;
    emitSync("pause", v.currentTime);
  };

  const onSeeked = () => {
    if (!canEmitNow("seek", v.currentTime)) return;
    emitSync("seek", v.currentTime);
  };

  const onRate = () => {
    if (state.isApplyingRemote) return;
    if (!shouldEmitLocalSync()) return;
    // Don't inject local speed changes into a room that isn't on Netflix.
    if (!roomIsOnNetflix(state)) return;
    const s = state.socket;
    const roomId = state.currentRoomId;
    if (!s || !roomId) return;
    // No videoUrl on set_speed: it isn't a navigation, so attaching the
    // local href would hijack the room's videoUrl (see emitSync).
    s.emit("sync_video", {
      roomId,
      action: "set_speed",
      timestamp: v.currentTime,
      playbackSpeed: v.playbackRate,
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
    // emitSync attaches location.href on change_url emits, so the server
    // will see the new URL and update the room's videoUrl.
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
