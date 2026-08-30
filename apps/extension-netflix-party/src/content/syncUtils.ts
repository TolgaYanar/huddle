import type { ContentState } from "./state";

export function isLikelyEchoEvent(
  state: ContentState,
  action: string,
  timestamp: number,
): boolean {
  if (!state.lastRemoteAction || !state.lastRemoteTimestamp) return false;
  const now = Date.now();

  // If we just applied a remote action, and we see a matching video event shortly after, it's likely an echo.
  // Use a shorter window (1.5s) to avoid blocking real user actions.
  if (now - state.lastRemoteApplyAt > 1500) return false;
  if (state.lastRemoteAction !== action) return false;
  return Math.abs(timestamp - state.lastRemoteTimestamp) < 1.5;
}

export function withRemoteGuard<T>(
  state: ContentState,
  fn: () => T,
  releaseDelayMs: number = 250,
): T {
  state.isApplyingRemote = true;
  try {
    return fn();
  } finally {
    window.setTimeout(() => {
      state.isApplyingRemote = false;
    }, releaseDelayMs);
  }
}

// --- receive_sync / room_state application rules -------------------------
//
// The server emits `receive_sync` (a partial event) and then `room_state`
// (the authoritative snapshot) back to back for every playback event. The
// three helpers below encode the rules that keep those two channels from
// fighting each other. They are pure so they can be unit-tested.

export type ApplySource = "room_state" | "receive_sync";

/**
 * Playback intent has three states, not two.
 *
 * `receive_sync` omits `isPlaying` for actions that carry no playback intent
 * (set_volume, set_mute, set_speed, set_audio_sync). Collapsing that absence
 * to `false` made the apply path actively pause the local Netflix video every
 * time anyone nudged the volume slider.
 *
 * `null` means "this message says nothing about play/pause — leave it alone".
 */
export function resolvePlaybackIntent(isPlaying: unknown): boolean | null {
  return typeof isPlaying === "boolean" ? isPlaying : null;
}

/**
 * Only these actions re-anchor the playback position on the server. For every
 * other action the broadcast `timestamp` is whatever the last play/seek left
 * behind, which can be minutes stale — feeding it to the drift check rewound
 * Netflix viewers to an old position.
 */
export function receiveSyncCarriesPosition(action: unknown): boolean {
  return (
    action === "play" ||
    action === "pause" ||
    action === "seek" ||
    action === "change_url"
  );
}

/**
 * The apply throttle protects Netflix from rapid seek/play calls, but it must
 * never drop a `room_state` snapshot: those are authoritative, rare, and
 * arrive microseconds after the `receive_sync` that just stamped the throttle.
 * Throttling both meant the correcting snapshot was always swallowed, so a
 * wrong partial apply never self-healed.
 */
export function shouldThrottleApply(
  source: ApplySource | undefined,
  now: number,
  lastRemoteApplyAt: number,
  windowMs = 250,
): boolean {
  if (source === "room_state") return false;
  return now - lastRemoteApplyAt < windowMs;
}
