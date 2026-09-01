const { createExpiryCleanup } = require("../shared/expiryCleanup");

const SESSION_CLEANUP_INITIAL_DELAY_MS = 60 * 1000;
const SESSION_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

// Expired sessions are filtered out at read time but never deleted, so the
// table grows monotonically. Session.expiresAt is indexed for this sweep.
function createSessionCleanup(options) {
  return createExpiryCleanup({
    label: "expired session",
    getModel: (prisma) => prisma?.session,
    initialDelayMs: SESSION_CLEANUP_INITIAL_DELAY_MS,
    intervalMs: SESSION_CLEANUP_INTERVAL_MS,
    ...options,
  });
}

module.exports = {
  SESSION_CLEANUP_INITIAL_DELAY_MS,
  SESSION_CLEANUP_INTERVAL_MS,
  createSessionCleanup,
};
