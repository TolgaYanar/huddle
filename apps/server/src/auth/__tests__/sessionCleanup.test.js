const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  SESSION_CLEANUP_INITIAL_DELAY_MS,
  SESSION_CLEANUP_INTERVAL_MS,
  createSessionCleanup,
} = require("../sessionCleanup");

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("expired session cleanup", () => {
  it("deletes sessions whose expiry is at or before the current time", async () => {
    const currentTime = new Date("2030-01-02T03:04:05.000Z");
    let deleteArgs = null;
    const cleanup = createSessionCleanup({
      isDbConnected: () => true,
      getPrisma: () => ({
        session: {
          deleteMany: async (args) => {
            deleteArgs = args;
            return { count: 3 };
          },
        },
      }),
      now: () => currentTime,
    });

    assert.equal(await cleanup.runNow(), 3);
    assert.deepEqual(deleteArgs, {
      where: { expiresAt: { lte: currentTime } },
    });
  });

  it("skips safely while the database is disconnected", async () => {
    let prismaRead = false;
    const cleanup = createSessionCleanup({
      isDbConnected: () => false,
      getPrisma: () => {
        prismaRead = true;
        return null;
      },
    });

    assert.equal(await cleanup.runNow(), 0);
    assert.equal(prismaRead, false);
  });

  it("coalesces overlapping runs into one database delete", async () => {
    const pending = deferred();
    let deleteCalls = 0;
    const cleanup = createSessionCleanup({
      isDbConnected: () => true,
      getPrisma: () => ({
        session: {
          deleteMany: () => {
            deleteCalls += 1;
            return pending.promise;
          },
        },
      }),
    });

    const first = cleanup.runNow();
    const second = cleanup.runNow();
    assert.equal(first, second);
    assert.equal(deleteCalls, 1);

    pending.resolve({ count: 1 });
    assert.equal(await first, 1);
    assert.equal(await second, 1);
  });

  it("logs failures without rejecting the scheduler", async () => {
    const errors = [];
    const cleanup = createSessionCleanup({
      isDbConnected: () => true,
      getPrisma: () => ({
        session: {
          deleteMany: async () => Promise.reject(new Error("db down")),
        },
      }),
      logError: (...args) => errors.push(args),
    });

    assert.equal(await cleanup.runNow(), 0);
    assert.equal(errors.length, 1);
    assert.match(errors[0][0], /expired sessions/);
  });

  it("schedules unref'ed startup and periodic runs and can stop both", () => {
    const scheduled = {};
    const cleared = [];
    const makeHandle = (kind) => ({
      unrefCalled: false,
      unref() {
        this.unrefCalled = true;
      },
      kind,
    });
    const cleanup = createSessionCleanup({
      isDbConnected: () => false,
      getPrisma: () => null,
      setTimeoutFn(callback, delay) {
        scheduled.timeout = { callback, delay, handle: makeHandle("timeout") };
        return scheduled.timeout.handle;
      },
      setIntervalFn(callback, delay) {
        scheduled.interval = {
          callback,
          delay,
          handle: makeHandle("interval"),
        };
        return scheduled.interval.handle;
      },
      clearTimeoutFn: (handle) => cleared.push(handle),
      clearIntervalFn: (handle) => cleared.push(handle),
    });

    cleanup.start();
    cleanup.start();

    assert.equal(scheduled.timeout.delay, SESSION_CLEANUP_INITIAL_DELAY_MS);
    assert.equal(scheduled.interval.delay, SESSION_CLEANUP_INTERVAL_MS);
    assert.equal(scheduled.timeout.handle.unrefCalled, true);
    assert.equal(scheduled.interval.handle.unrefCalled, true);

    cleanup.stop();
    assert.deepEqual(cleared, [
      scheduled.timeout.handle,
      scheduled.interval.handle,
    ]);
  });
});

describe("session cleanup recovers from a failing delete", () => {
  it("keeps running after deleteMany throws synchronously", async () => {
    // A synchronous throw settles the run during the IIFE's synchronous phase.
    // Clearing the in-flight slot from a `finally` inside that body therefore
    // ran *before* the slot was assigned, latching a settled promise: every
    // later run short-circuited on it and the cleaner never touched the
    // database again for the lifetime of the process.
    let calls = 0;
    const prisma = {
      session: {
        deleteMany() {
          calls += 1;
          if (calls === 1) throw new Error("sync failure");
          return Promise.resolve({ count: 3 });
        },
      },
    };
    const cleanup = createSessionCleanup({
      getPrisma: () => prisma,
      isDbConnected: () => true,
      logError: () => {},
    });

    assert.equal(await cleanup.runNow(), 0);
    assert.equal(await cleanup.runNow(), 3);
    assert.equal(await cleanup.runNow(), 3);
    assert.equal(calls, 3);
  });

  it("keeps running after deleteMany rejects", async () => {
    let calls = 0;
    const prisma = {
      session: {
        deleteMany() {
          calls += 1;
          if (calls === 1) return Promise.reject(new Error("async failure"));
          return Promise.resolve({ count: 2 });
        },
      },
    };
    const cleanup = createSessionCleanup({
      getPrisma: () => prisma,
      isDbConnected: () => true,
      logError: () => {},
    });

    assert.equal(await cleanup.runNow(), 0);
    assert.equal(await cleanup.runNow(), 2);
    assert.equal(calls, 2);
  });

  it("still collapses genuinely concurrent runs into one query", async () => {
    let calls = 0;
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const prisma = {
      session: {
        deleteMany() {
          calls += 1;
          return gate.then(() => ({ count: 1 }));
        },
      },
    };
    const cleanup = createSessionCleanup({
      getPrisma: () => prisma,
      isDbConnected: () => true,
      logError: () => {},
    });

    const first = cleanup.runNow();
    const second = cleanup.runNow();
    release();

    assert.deepEqual(await Promise.all([first, second]), [1, 1]);
    assert.equal(calls, 1, "the second call reused the in-flight run");
  });
});
