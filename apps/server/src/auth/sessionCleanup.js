const SESSION_CLEANUP_INITIAL_DELAY_MS = 60 * 1000;
const SESSION_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

function createSessionCleanup({
  getPrisma,
  isDbConnected,
  vLog,
  logError = console.warn,
  now = () => new Date(),
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
  initialDelayMs = SESSION_CLEANUP_INITIAL_DELAY_MS,
  intervalMs = SESSION_CLEANUP_INTERVAL_MS,
}) {
  let activeCleanup = null;
  let initialTimer = null;
  let intervalTimer = null;
  let started = false;

  function runNow() {
    if (activeCleanup) return activeCleanup;
    if (!isDbConnected()) return Promise.resolve(0);

    const prisma = getPrisma();
    if (!prisma?.session?.deleteMany) return Promise.resolve(0);

    const run = (async () => {
      try {
        const result = await prisma.session.deleteMany({
          where: { expiresAt: { lte: now() } },
        });
        const deleted = Number.isFinite(result?.count) ? result.count : 0;
        if (deleted > 0 && typeof vLog === "function") {
          vLog(`Cleaned up ${deleted} expired session(s)`);
        }
        return deleted;
      } catch (err) {
        logError("Failed to clean up expired sessions:", err);
        return 0;
      }
    })();

    activeCleanup = run;

    // Release the in-flight slot only after `activeCleanup` has been assigned.
    // A `finally` inside the async body ran too early when deleteMany threw
    // synchronously: the clear happened during the IIFE's synchronous phase,
    // before the assignment below, so the settled promise stayed latched and
    // every later run short-circuited on it. The cleaner then never touched
    // the database again for the lifetime of the process.
    void run.then(
      () => {
        if (activeCleanup === run) activeCleanup = null;
      },
      () => {
        if (activeCleanup === run) activeCleanup = null;
      },
    );

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

module.exports = {
  SESSION_CLEANUP_INITIAL_DELAY_MS,
  SESSION_CLEANUP_INTERVAL_MS,
  createSessionCleanup,
};
