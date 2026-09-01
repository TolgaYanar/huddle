const { createExpiryCleanup } = require("../shared/expiryCleanup");

// Telemetry rows carry a 30-day expiresAt. Sweep hourly after a short startup
// delay, exactly like the session sweeper: the table only grows otherwise, and
// nothing else ever deletes from it.
const TELEMETRY_CLEANUP_INITIAL_DELAY_MS = 90 * 1000;
const TELEMETRY_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

function createTelemetryCleanup(options) {
  return createExpiryCleanup({
    label: "expired telemetry row",
    getModel: (prisma) => prisma?.syncMetric,
    initialDelayMs: TELEMETRY_CLEANUP_INITIAL_DELAY_MS,
    intervalMs: TELEMETRY_CLEANUP_INTERVAL_MS,
    ...options,
  });
}

module.exports = {
  TELEMETRY_CLEANUP_INITIAL_DELAY_MS,
  TELEMETRY_CLEANUP_INTERVAL_MS,
  createTelemetryCleanup,
};
