const { createExpiryCleanup } = require("./expiryCleanup");

// Chat messages and activity events were kept forever: only the newest 50/100
// per room are ever read back (CHAT_HISTORY_LIMIT / ACTIVITY_HISTORY_LIMIT),
// but sync_video writes an activity row for every accepted playback event, so
// both tables grew without bound. Rows older than the retention window are
// swept on the shared expiry driver, keyed on the createdAt index.
const HISTORY_RETENTION_DAYS = 90;
const HISTORY_RETENTION_MS = HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000;
const HISTORY_CLEANUP_INITIAL_DELAY_MS = 2 * 60 * 1000;
const HISTORY_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

function createHistoryCleanups({ now = () => new Date(), ...options }) {
  const cutoff = () => new Date(now().getTime() - HISTORY_RETENTION_MS);
  const shared = {
    field: "createdAt",
    cutoff,
    now,
    initialDelayMs: HISTORY_CLEANUP_INITIAL_DELAY_MS,
    intervalMs: HISTORY_CLEANUP_INTERVAL_MS,
    ...options,
  };
  const cleanups = [
    createExpiryCleanup({
      label: "old chat message",
      getModel: (prisma) => prisma?.roomMessage,
      ...shared,
    }),
    createExpiryCleanup({
      label: "old room activity row",
      getModel: (prisma) => prisma?.roomActivity,
      ...shared,
    }),
  ];
  return {
    start: () => cleanups.forEach((c) => c.start()),
    stop: () => cleanups.forEach((c) => c.stop()),
    runNow: () => Promise.all(cleanups.map((c) => c.runNow())),
  };
}

module.exports = {
  HISTORY_RETENTION_DAYS,
  HISTORY_RETENTION_MS,
  HISTORY_CLEANUP_INITIAL_DELAY_MS,
  HISTORY_CLEANUP_INTERVAL_MS,
  createHistoryCleanups,
};
