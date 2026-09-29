/**
 * Sync/seek tracing. These messages fired in every user's console on every
 * seek and pause; they are only useful while debugging sync, so they are now
 * opt-in, like the YouTube flags: localStorage "huddle:debugSync" = "1".
 */
export function isSyncDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem("huddle:debugSync") === "1";
  } catch {
    return false;
  }
}

export function syncDebug(...args: unknown[]): void {
  if (!isSyncDebugEnabled()) return;
  console.log(...args);
}
