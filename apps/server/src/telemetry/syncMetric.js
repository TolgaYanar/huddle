// Validation for the sync-quality telemetry payload.
//
// This is untrusted input from an unauthenticated guest browser. It is only
// ever aggregated into counters, and must never inform an authorization,
// security or billing decision. Anything not on the allow-list below is
// dropped rather than stored, so a client cannot smuggle a room id, a content
// title or a URL into the table by adding fields.

const SOURCES = new Set(["web", "extension"]);

// Platforms the product actually supports. An unknown value is recorded as
// "other" rather than rejected, so a newly added platform does not silently
// lose all telemetry until the server ships.
const PLATFORMS = new Set([
  "youtube",
  "twitch",
  "kick",
  "vimeo",
  "dailymotion",
  "soundcloud",
  "loom",
  "peertube",
  "netflix",
  "direct",
  "hls",
  "dash",
  "wistia",
  "spotify",
  "tiktok",
  "prime",
  "disney_plus",
  "hbo",
  "hulu",
  "apple_tv_plus",
  "paramount_plus",
  "peacock",
  "file",
  "other",
]);

const COUNTER_FIELDS = [
  "playerFound",
  "playerMissing",
  "commandsSent",
  "commandsApplied",
  "commandsFailed",
  "joinAttempts",
  "joinSuccess",
  "reconnects",
  "hardSeeks",
  "catchupExhausted",
  "autoplayBlocked",
  "contentMismatch",
  "driftLt1",
  "driftLt3",
  "driftLt5",
  "driftLt10",
  "driftGte10",
];

// A session cannot plausibly produce more than this many of any one event.
// Bounding it keeps a malicious client from skewing aggregates.
const MAX_COUNTER = 100000;

const MAX_SESSION_ID_LENGTH = 64;
const MAX_RELEASE_LENGTH = 64;
const MAX_SEQUENCE = 1_000_000_000;

// Retention horizon: long enough to compare a release against the previous
// one, short enough that the table stays small.
const RETENTION_DAYS = 30;

function isSafeToken(value, maxLength) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxLength &&
    // No separators, no scheme, no path: this can never hold a URL.
    /^[A-Za-z0-9._-]+$/.test(value)
  );
}

function normalizeCounter(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  const rounded = Math.floor(value);
  if (rounded <= 0) return 0;
  return Math.min(rounded, MAX_COUNTER);
}

/**
 * Returns a row ready for prisma.syncMetric.create, or null when the payload
 * is unusable. Never throws: a bad payload is a dropped measurement, not an
 * error the caller has to handle.
 */
function parseSyncMetric(body, { now = () => new Date() } = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;

  if (!isSafeToken(body.sessionId, MAX_SESSION_ID_LENGTH)) return null;
  if (!SOURCES.has(body.source)) return null;
  if (
    !Number.isSafeInteger(body.sequence) ||
    body.sequence < 0 ||
    body.sequence > MAX_SEQUENCE
  ) {
    return null;
  }

  const platform =
    typeof body.platform === "string" && PLATFORMS.has(body.platform)
      ? body.platform
      : "other";

  const release = isSafeToken(body.release, MAX_RELEASE_LENGTH)
    ? body.release
    : null;

  const row = {
    sessionId: body.sessionId,
    sequence: body.sequence,
    source: body.source,
    platform,
    release,
    expiresAt: new Date(now().getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000),
  };

  let total = 0;
  for (const field of COUNTER_FIELDS) {
    const value = normalizeCounter(body[field]);
    row[field] = value;
    total += value;
  }

  // An all-zero summary measures nothing; storing it only costs rows.
  if (total === 0) return null;

  return row;
}

/**
 * Stores a cumulative session snapshot exactly once per source/session.
 * A later network response can arrive before an earlier one, so only a
 * strictly newer sequence may replace the counters already stored.
 */
async function storeSyncMetric(prisma, row) {
  const { sessionId, source, sequence, ...snapshot } = row;
  const where = {
    sessionId,
    source,
    sequence: { lt: sequence },
  };
  const data = { ...snapshot, sequence };

  const updated = await prisma.syncMetric.updateMany({ where, data });
  if (updated.count > 0) return true;

  try {
    await prisma.syncMetric.create({
      data: { sessionId, source, ...data },
    });
    return true;
  } catch (err) {
    // A concurrent first flush may have won the unique-key race. Retry the
    // monotonic update once; duplicates and stale snapshots remain no-ops.
    if (err?.code !== "P2002") throw err;
    const retried = await prisma.syncMetric.updateMany({ where, data });
    return retried.count > 0;
  }
}

module.exports = {
  COUNTER_FIELDS,
  MAX_COUNTER,
  MAX_SEQUENCE,
  PLATFORMS,
  RETENTION_DAYS,
  SOURCES,
  parseSyncMetric,
  storeSyncMetric,
};
