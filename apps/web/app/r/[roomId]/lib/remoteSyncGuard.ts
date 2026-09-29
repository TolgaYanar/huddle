/**
 * Shared ownership of `applyingRemoteSyncRef`.
 *
 * Several paths raise this guard for a short window (applying room state,
 * room catch-up seeks) so the player callbacks their seek triggers are not
 * re-broadcast as local events. Each used to schedule its own blind
 * `current = false`, so a 350 ms catch-up release could drop a 400 ms hold
 * that room-state application had taken just after it — opening a window in
 * which a remote change echoed back out as a local one (a sync feedback loop).
 *
 * Holds now extend one deadline per guard; a release only lowers the guard
 * once the latest hold has expired.
 */
type Guard = { current: boolean };

const holdUntil = new WeakMap<Guard, number>();

export function holdRemoteSyncGuard(guard: Guard, durationMs: number): void {
  const until = Math.max(holdUntil.get(guard) ?? 0, Date.now() + durationMs);
  holdUntil.set(guard, until);
  guard.current = true;
  window.setTimeout(() => {
    const latest = holdUntil.get(guard);
    if (latest === undefined || Date.now() < latest) return;
    holdUntil.delete(guard);
    guard.current = false;
  }, durationMs);
}

/** Drops every hold at once (teardown). */
export function releaseRemoteSyncGuard(guard: Guard): void {
  holdUntil.delete(guard);
  guard.current = false;
}
