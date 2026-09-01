const test = require("node:test");
const assert = require("node:assert/strict");

const {
  MAX_BODY_BYTES,
  SESSION_RATE_LIMIT,
  registerTelemetryRoutes,
} = require("../../routes/telemetry");

function validBody(overrides = {}) {
  return {
    sessionId: "session-a",
    sequence: 1,
    source: "web",
    platform: "youtube",
    commandsSent: 1,
    ...overrides,
  };
}

function makeDeps(model, connected = true) {
  return {
    getPrisma: () => ({ syncMetric: model }),
    isDbConnected: () => connected,
    vLog: () => {},
  };
}

function captureHandlers(deps) {
  let handlers = null;
  registerTelemetryRoutes(
    {
      post(path, ...registered) {
        assert.equal(path, "/api/telemetry/sync");
        handlers = registered;
      },
    },
    deps,
  );
  assert.ok(handlers);
  return handlers;
}

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
  };
}

async function invokeParsed(handlers, body, ip = "127.0.0.1") {
  const req = {
    body,
    ip,
    headers: {},
    connection: { remoteAddress: ip },
  };
  const res = makeRes();

  let allowed = false;
  handlers[0](req, res, () => {
    allowed = true;
  });
  if (!allowed) return res;

  // handlers[1] is express.json({ limit: "16kb" }); its actual byte-limit
  // behavior is covered by the live HTTP verification. Here the request is
  // intentionally already parsed so route policy can be unit-tested without
  // opening a network listener in restricted test environments.
  allowed = false;
  handlers[2](req, res, () => {
    allowed = true;
  });
  if (!allowed) return res;

  await handlers[3](req, res);
  return res;
}

test("telemetry route keeps its parser limit at 16 KB", () => {
  assert.equal(MAX_BODY_BYTES, "16kb");
});

test("telemetry route stores a valid summary and returns 202", async () => {
  let created = null;
  const model = {
    updateMany: async () => ({ count: 0 }),
    create: async ({ data }) => {
      created = data;
      return data;
    },
  };
  const handlers = captureHandlers(makeDeps(model));

  const res = await invokeParsed(handlers, validBody());
  assert.equal(res.statusCode, 202);
  assert.deepEqual(res.body, { accepted: true });
  assert.equal(created.sessionId, "session-a");
  assert.equal(created.commandsSent, 1);
  assert.equal("roomId" in created, false);
});

test("telemetry route drops metrics while the database is unavailable", async () => {
  let writes = 0;
  const model = {
    updateMany: async () => ({ count: ++writes }),
    create: async () => {
      writes += 1;
    },
  };
  const handlers = captureHandlers(makeDeps(model, false));

  const res = await invokeParsed(handlers, validBody());
  assert.equal(res.statusCode, 202);
  assert.deepEqual(res.body, { accepted: false });
  assert.equal(writes, 0);
});

test("telemetry route limits one anonymous session without returning an error", async () => {
  const model = {
    updateMany: async () => ({ count: 1 }),
    create: async () => {
      throw new Error("create should not run");
    },
  };
  const handlers = captureHandlers(makeDeps(model));

  for (let sequence = 1; sequence <= SESSION_RATE_LIMIT; sequence += 1) {
    const res = await invokeParsed(handlers, validBody({ sequence }));
    assert.deepEqual(res.body, { accepted: true });
  }

  const limited = await invokeParsed(
    handlers,
    validBody({ sequence: SESSION_RATE_LIMIT + 1 }),
  );
  assert.equal(limited.statusCode, 202);
  assert.deepEqual(limited.body, { accepted: false });
});
