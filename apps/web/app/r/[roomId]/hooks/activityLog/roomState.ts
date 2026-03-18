import type { RoomStateData } from "shared-logic";

import { normalizeVideoUrl } from "../../lib/video";
import { getCurrentTimeFromRef, seekToFromRef } from "../../lib/player";
import { serverTimeToClientTime } from "./serverTime";
import type { RoomPlaybackAnchor } from "./types";
import { USER_PAUSE_INTENT_WINDOW_MS } from "../useVideoPlayer/constants";

export function applyRoomState({
  state,
  roomId,
  playerRef,
  hasInitialSyncRef,
  lastAppliedRoomRevRef,
  markApplyingRemoteSync,
  setRoomPlaybackAnchor,
  setUrl,
  setInputUrl,
  setVideoState,
  setMuted,
  setVolume,
  setPlaybackRate,
  setAudioSyncEnabled,
  lastUserPauseAtRef,
}: {
  state: RoomStateData;
  roomId: string;
  playerRef: React.RefObject<unknown>;
  hasInitialSyncRef?: React.MutableRefObject<boolean>;
  lastAppliedRoomRevRef: React.MutableRefObject<number>;
  markApplyingRemoteSync: (durationMs?: number) => void;
  setRoomPlaybackAnchor: (next: RoomPlaybackAnchor) => void;
  setUrl: (url: string) => void;
  setInputUrl: (url: string) => void;
  setVideoState: (state: string) => void;
  setMuted: (muted: boolean) => void;
  setVolume: (volume: number) => void;
  setPlaybackRate: (rate: number) => void;
  setAudioSyncEnabled: (enabled: boolean) => void;
  lastUserPauseAtRef?: React.MutableRefObject<number>;
}) {
  if (!state || state.roomId !== roomId) return;

  if (typeof state.rev === "number" && Number.isFinite(state.rev)) {
    lastAppliedRoomRevRef.current = Math.max(
      lastAppliedRoomRevRef.current,
      state.rev,
    );
  }

  // Room state application may include a seek; give embedded players longer.
  markApplyingRemoteSync(400);

  if (state.videoUrl) {
    const nextUrl = normalizeVideoUrl(state.videoUrl);
    setUrl(nextUrl);
    setInputUrl(nextUrl);

    const t = typeof state.timestamp === "number" ? state.timestamp : 0;
    const rate =
      typeof state.playbackSpeed === "number" &&
      Number.isFinite(state.playbackSpeed)
        ? state.playbackSpeed
        : 1;
    const playing = state.isPlaying === true || state.action === "play";

    const receivedAt = Date.now();

    // If server already extrapolated (serverNow present), use current time as anchor
    // Otherwise use the original updatedAt for local extrapolation
    const serverAlreadyExtrapolated =
      typeof state.serverNow === "number" && Number.isFinite(state.serverNow);
    const anchorAt = serverAlreadyExtrapolated
      ? receivedAt
      : typeof state.updatedAt === "number" && Number.isFinite(state.updatedAt)
        ? serverTimeToClientTime(state.updatedAt, state.serverNow, receivedAt)
        : receivedAt;

    setRoomPlaybackAnchor({
      url: nextUrl,
      isPlaying: playing,
      anchorTime: t,
      anchorAt: anchorAt,
      playbackRate: rate,
    });
  }

  if (typeof state.timestamp === "number" && playerRef.current) {
    const current = getCurrentTimeFromRef(playerRef);

    const rate =
      typeof state.playbackSpeed === "number" &&
      Number.isFinite(state.playbackSpeed)
        ? state.playbackSpeed
        : 1;

    let target = state.timestamp;
    // Only extrapolate if server didn't already (serverNow presence indicates server-side extrapolation)
    // For room_state events from join/resync, server calculates estimated position
    // For sync_video events, we need to extrapolate ourselves
    const serverAlreadyExtrapolated = typeof state.serverNow === "number";

    if (!serverAlreadyExtrapolated && state.isPlaying === true) {
      const updatedAt =
        typeof state.updatedAt === "number" && Number.isFinite(state.updatedAt)
          ? state.updatedAt
          : Date.now();
      // Advance by the actual elapsed time since the room state was updated
      // so late joiners land at the live position.
      const elapsed = Math.max(0, (Date.now() - updatedAt) / 1000);
      target = state.timestamp + elapsed * rate;
    }

    // Clamp to valid range — guards against stale updatedAt overshooting video end.
    target = Math.max(0, target);

    // Only seek if significantly out of sync
    if (Math.abs(current - target) > 2) {
      seekToFromRef(playerRef, target);
    }
  }

  // Mark initial sync complete after room state is received.
  // Keep this short so a page reload doesn't "break" controls.
  if (hasInitialSyncRef && !hasInitialSyncRef.current) {
    window.setTimeout(() => {
      hasInitialSyncRef.current = true;
    }, 150);
  }

  if (typeof state.volume === "number" && Number.isFinite(state.volume)) {
    setVolume(Math.max(0, Math.min(1, state.volume)));
  }

  if (typeof state.isMuted === "boolean") {
    // Avoid forcing unmute before user interaction (autoplay policy).
    // Keep playback muted so it can start automatically; user can unmute after interacting.
    if (state.isMuted === false) {
      const canUnmute =
        typeof navigator !== "undefined" &&
        (navigator as { userActivation?: { hasBeenActive?: boolean } })
          .userActivation?.hasBeenActive;
      if (canUnmute) {
        setMuted(false);
      } else {
        setMuted(true);
      }
    } else {
      setMuted(true);
    }
  }

  if (typeof state.audioSyncEnabled === "boolean") {
    setAudioSyncEnabled(state.audioSyncEnabled);
  }

  if (
    typeof state.playbackSpeed === "number" &&
    Number.isFinite(state.playbackSpeed)
  ) {
    setPlaybackRate(state.playbackSpeed);
  }

  if (typeof state.isPlaying === "boolean") {
    if (state.isPlaying) {
      const userPausedRecently =
        !!lastUserPauseAtRef &&
        Date.now() - lastUserPauseAtRef.current < USER_PAUSE_INTENT_WINDOW_MS;
      if (!userPausedRecently) {
        setVideoState("Playing");
      }
    } else {
      setVideoState("Paused");
    }
  } else {
    if (state.action === "play") {
      const userPausedRecently =
        !!lastUserPauseAtRef &&
        Date.now() - lastUserPauseAtRef.current < USER_PAUSE_INTENT_WINDOW_MS;
      if (!userPausedRecently) setVideoState("Playing");
    }
    if (state.action === "pause") setVideoState("Paused");
  }
}
