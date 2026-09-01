const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { attachTelemetryHandlers } = require("../telemetry");

function createSocket() {
  const handlers = new Map();
  return {
    id: "sock-1",
    on(event, fn) {
      handlers.set(event, fn);
    },
    emit() {},
    handlers,
  };
}

function createDeps({ connected = true, created = [] } = {}) {
  return {
    isDbConnected: () => connected,
    getPrisma: () => ({
      syncMetric: {
        create: async ({ data }) => {
          created.push(data);
          return data;
        },
        updateMany: async () => ({ count: 0 }),
      },
    }),
    vLog: undefined,
    created,
  };
}

function validPayload(overrides = {}) {
  return {
    sessionId: "sess-1",
    source: "extension",
    platform: "netflix",
    sequence: 1,
    hardSeeks: 2,
    ...overrides,
  };
}

describe("telemetry over the socket", () => {
  it("stores a well-formed summary", async () => {
    const socket = createSocket();
    const created = [];
    attachTelemetryHandlers(socket, createDeps({ created }));

    await socket.handlers.get("telemetry_sync")(validPayload());

    assert.equal(created.length, 1);
    assert.equal(created[0].platform, "netflix");
    assert.equal(created[0].hardSeeks, 2);
  });

  it("applies the same validator as the HTTP route", async () => {
    const socket = createSocket();
    const created = [];
    attachTelemetryHandlers(socket, createDeps({ created }));

    // A session id that could carry a watch URL must be rejected here too.
    await socket.handlers.get("telemetry_sync")(
      validPayload({ sessionId: "https://netflix.com/watch/1" }),
    );
    // Extra fields must never reach the database.
    await socket.handlers.get("telemetry_sync")(
      validPayload({ sessionId: "sess-2", roomId: "movie-night" }),
    );

    assert.equal(created.length, 1);
    assert.equal("roomId" in created[0], false);
  });

  it("does nothing when the database is unavailable", async () => {
    const socket = createSocket();
    const created = [];
    attachTelemetryHandlers(socket, createDeps({ connected: false, created }));

    await socket.handlers.get("telemetry_sync")(validPayload());

    assert.equal(created.length, 0);
  });

  it("rate limits a flood from one socket", async () => {
    const socket = createSocket();
    const created = [];
    attachTelemetryHandlers(socket, createDeps({ created }));
    const handler = socket.handlers.get("telemetry_sync");

    for (let i = 0; i < 40; i++) {
      await handler(validPayload({ sessionId: `sess-${i}` }));
    }

    // 20 per 5 minutes; the rest are dropped rather than stored.
    assert.equal(created.length, 20);
  });

  it("never throws back at the caller when storage fails", async () => {
    const socket = createSocket();
    const deps = {
      isDbConnected: () => true,
      getPrisma: () => ({
        syncMetric: {
          create: async () => {
            throw new Error("db down");
          },
          updateMany: async () => ({ count: 0 }),
        },
      }),
    };
    attachTelemetryHandlers(socket, deps);

    // Measurement must never surface to the client or affect playback.
    await assert.doesNotReject(
      socket.handlers.get("telemetry_sync")(validPayload()),
    );
  });

  it("ignores a malformed payload without touching the database", async () => {
    const socket = createSocket();
    const created = [];
    attachTelemetryHandlers(socket, createDeps({ created }));
    const handler = socket.handlers.get("telemetry_sync");

    for (const bad of [null, undefined, "x", 7, [], {}]) {
      await assert.doesNotReject(handler(bad));
    }
    assert.equal(created.length, 0);
  });

  it("drops a payload larger than the HTTP telemetry boundary", async () => {
    const socket = createSocket();
    const created = [];
    attachTelemetryHandlers(socket, createDeps({ created }));

    await socket.handlers.get("telemetry_sync")(
      validPayload({ pad: "x".repeat(16 * 1024) }),
    );

    assert.equal(created.length, 0);
  });
});
