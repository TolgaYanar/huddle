/**
 * Periodic sweeper for any model with an indexed `expiresAt` column.
 *
 * Extracted so the session and telemetry sweepers share one implementation.
 * The subtle part is releasing the in-flight slot: a `finally` inside the
 * async body runs during its synchronous phase when deleteMany throws
 * synchronously, i.e. before `activeCleanup` has been assigned. That latched a
 * settled promise and permanently disabled the sweeper. The slot is therefore
 * released after assignment, guarded by identity.
 */
function createExpiryCleanup({
  label,
  getModel,
  getPrisma,
  isDbConnected,
  vLog,
  logError = console.warn,
  now = () => new Date(),
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
  initialDelayMs,
  intervalMs,
}) {
  let activeCleanup = null;
  let initialTimer = null;
  let intervalTimer = null;
  let started = false;

  function runNow() {
    if (activeCleanup) return activeCleanup;
    if (!isDbConnected()) return Promise.resolve(0);

    const model = getModel(getPrisma());
    if (!model?.deleteMany) return Promise.resolve(0);

    const run = (async () => {
      try {
        const result = await model.deleteMany({
          where: { expiresAt: { lte: now() } },
        });
        const deleted = Number.isFinite(result?.count) ? result.count : 0;
        if (deleted > 0 && typeof vLog === "function") {
          vLog(`Cleaned up ${deleted} ${label}(s)`);
        }
        return deleted;
      } catch (err) {
        logError(`Failed to clean up ${label}s:`, err);
        return 0;
      }
    })();

    activeCleanup = run;
    const release = () => {
      if (activeCleanup === run) activeCleanup = null;
    };
    void run.then(release, release);

    return run;
  }

  function scheduleRun() {
    void runNow();
  }

  function start() {
    if (started) return;
    started = true;
    initialTimer = setTimeoutFn(scheduleRun, initialDelayMs);
    intervalTimer = setIntervalFn(scheduleRun, intervalMs);
    // Never let a pending sweep keep the process alive.
    if (typeof initialTimer?.unref === "function") initialTimer.unref();
    if (typeof intervalTimer?.unref === "function") intervalTimer.unref();
  }

  function stop() {
    if (!started) return;
    started = false;
    if (initialTimer) clearTimeoutFn(initialTimer);
    if (intervalTimer) clearIntervalFn(intervalTimer);
    initialTimer = null;
    intervalTimer = null;
  }

  return { runNow, start, stop };
}

module.exports = { createExpiryCleanup };
