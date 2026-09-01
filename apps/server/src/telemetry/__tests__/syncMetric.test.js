const test = require("node:test");
const assert = require("node:assert/strict");

const {
  COUNTER_FIELDS,
  MAX_COUNTER,
  MAX_SEQUENCE,
  RETENTION_DAYS,
  parseSyncMetric,
  storeSyncMetric,
} = require("../syncMetric");

function validBody(overrides = {}) {
  return {
    sessionId: "abc123",
    sequence: 1,
    source: "web",
    platform: "youtube",
    hardSeeks: 2,
    ...overrides,
  };
}

test("accepts a well-formed summary", () => {
  const row = parseSyncMetric(validBody());
  assert.equal(row.sessionId, "abc123");
  assert.equal(row.source, "web");
  assert.equal(row.platform, "youtube");
  assert.equal(row.hardSeeks, 2);
});

test("sets an expiry at the retention horizon", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  const row = parseSyncMetric(validBody(), { now: () => now });
  const days = (row.expiresAt - now) / (24 * 60 * 60 * 1000);
  assert.equal(days, RETENTION_DAYS);
});

test("defaults every counter so a partial payload is still storable", () => {
  const row = parseSyncMetric(validBody());
  for (const field of COUNTER_FIELDS) {
    assert.equal(typeof row[field], "number", field);
  }
});

test("drops a summary that measured nothing", () => {
  assert.equal(parseSyncMetric(validBody({ hardSeeks: 0 })), null);
});

test("rejects a malformed or missing session id", () => {
  for (const sessionId of [undefined, "", 42, "a".repeat(65)]) {
    assert.equal(
      parseSyncMetric(validBody({ sessionId })),
      null,
      String(sessionId),
    );
  }
});

test("requires a bounded monotonic sequence", () => {
  for (const sequence of [undefined, -1, 1.5, MAX_SEQUENCE + 1]) {
    assert.equal(parseSyncMetric(validBody({ sequence })), null);
  }
});

test("rejects a session id that could carry a URL", () => {
  // The character class is what guarantees a room id or watch URL cannot be
  // smuggled through this field.
  for (const sessionId of [
    "https://netflix.com/watch/123",
    "room/movie-night",
    "a b",
    "a?b=c",
  ]) {
    assert.equal(parseSyncMetric(validBody({ sessionId })), null, sessionId);
  }
});

test("rejects an unknown source", () => {
  assert.equal(parseSyncMetric(validBody({ source: "android" })), null);
  assert.equal(parseSyncMetric(validBody({ source: undefined })), null);
});

test("records an unknown platform as other rather than dropping the row", () => {
  const row = parseSyncMetric(validBody({ platform: "disneyplus" }));
  assert.equal(row.platform, "other");
});

test("never stores an unexpected field", () => {
  const row = parseSyncMetric(
    validBody({ roomId: "movie-night", title: "The Matrix", url: "https://x" }),
  );
  assert.equal("roomId" in row, false);
  assert.equal("title" in row, false);
  assert.equal("url" in row, false);
});

test("clamps a counter a malicious client inflated", () => {
  const row = parseSyncMetric(validBody({ hardSeeks: 10 ** 9 }));
  assert.equal(row.hardSeeks, MAX_COUNTER);
});

test("normalises negative, fractional and non-numeric counters", () => {
  const row = parseSyncMetric(
    validBody({ hardSeeks: 5, driftLt1: -3, driftLt3: 2.7, driftLt5: "9" }),
  );
  assert.equal(row.driftLt1, 0);
  assert.equal(row.driftLt3, 2);
  assert.equal(row.driftLt5, 0);
});

test("ignores a release that is not a plain build token", () => {
  assert.equal(parseSyncMetric(validBody({ release: "a b" })).release, null);
  assert.equal(
    parseSyncMetric(validBody({ release: "1.2.0" })).release,
    "1.2.0",
  );
});

test("rejects non-object bodies without throwing", () => {
  for (const body of [null, undefined, "x", 7, []]) {
    assert.doesNotThrow(() => parseSyncMetric(body));
    assert.equal(parseSyncMetric(body), null);
  }
});

test("stores only the newest cumulative snapshot for a session", async () => {
  let stored = null;
  const prisma = {
    syncMetric: {
      async updateMany({ where, data }) {
        if (
          stored &&
          stored.sessionId === where.sessionId &&
          stored.source === where.source &&
          stored.sequence < where.sequence.lt
        ) {
          stored = { ...stored, ...data };
          return { count: 1 };
        }
        return { count: 0 };
      },
      async create({ data }) {
        if (stored) {
          const err = new Error("unique");
          err.code = "P2002";
          throw err;
        }
        stored = data;
        return data;
      },
    },
  };

  assert.equal(
    await storeSyncMetric(prisma, parseSyncMetric(validBody({ sequence: 2 }))),
    true,
  );
  assert.equal(
    await storeSyncMetric(
      prisma,
      parseSyncMetric(validBody({ sequence: 1, hardSeeks: 99 })),
    ),
    false,
  );
  assert.equal(stored.sequence, 2);
  assert.equal(stored.hardSeeks, 2);

  assert.equal(
    await storeSyncMetric(
      prisma,
      parseSyncMetric(validBody({ sequence: 3, hardSeeks: 4 })),
    ),
    true,
  );
  assert.equal(stored.sequence, 3);
  assert.equal(stored.hardSeeks, 4);
});
