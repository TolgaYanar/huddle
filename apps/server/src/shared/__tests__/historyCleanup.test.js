const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  HISTORY_RETENTION_MS,
  createHistoryCleanups,
} = require("../historyCleanup");
const { createExpiryCleanup } = require("../expiryCleanup");

function fakeModel() {
  const calls = [];
  return {
    calls,
    async deleteMany(args) {
      calls.push(args);
      return { count: 3 };
    },
  };
}

describe("history retention cleanup", () => {
  it("deletes chat and activity rows older than the retention window", async () => {
    const roomMessage = fakeModel();
    const roomActivity = fakeModel();
    const fixedNow = new Date("2026-09-29T12:00:00Z");
    const cleanup = createHistoryCleanups({
      getPrisma: () => ({ roomMessage, roomActivity }),
      isDbConnected: () => true,
      now: () => fixedNow,
    });

    const deleted = await cleanup.runNow();

    const expectedCutoff = new Date(fixedNow.getTime() - HISTORY_RETENTION_MS);
    for (const model of [roomMessage, roomActivity]) {
      assert.deepEqual(model.calls, [
        { where: { createdAt: { lte: expectedCutoff } } },
      ]);
    }
    assert.deepEqual(deleted, [3, 3]);
  });

  it("keeps 90 days of history", () => {
    assert.equal(HISTORY_RETENTION_MS, 90 * 24 * 60 * 60 * 1000);
  });

  it("does nothing while the database is disconnected", async () => {
    const roomMessage = fakeModel();
    const cleanup = createHistoryCleanups({
      getPrisma: () => ({ roomMessage, roomActivity: fakeModel() }),
      isDbConnected: () => false,
    });
    await cleanup.runNow();
    assert.equal(roomMessage.calls.length, 0);
  });
});

describe("expiry cleanup defaults", () => {
  it("still sweeps expiresAt <= now when no field is given", async () => {
    const model = fakeModel();
    const fixedNow = new Date("2026-01-01T00:00:00Z");
    const cleanup = createExpiryCleanup({
      label: "thing",
      getModel: () => model,
      getPrisma: () => ({}),
      isDbConnected: () => true,
      now: () => fixedNow,
      initialDelayMs: 1,
      intervalMs: 1,
    });
    await cleanup.runNow();
    assert.deepEqual(model.calls, [
      { where: { expiresAt: { lte: fixedNow } } },
    ]);
  });
});
