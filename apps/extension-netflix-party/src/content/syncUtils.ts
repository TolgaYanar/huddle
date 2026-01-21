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
