const test = require("node:test");
const assert = require("node:assert/strict");

const { IP_RATE_LIMIT, registerIceRoutes } = require("../../routes/ice");
const { readIceConfig } = require("../iceConfig");

function captureHandlers(deps) {
  let handlers = null;
  registerIceRoutes(
    {
      get(path, ...registered) {
        assert.equal(path, "/api/webrtc/ice");
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
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function run(handlers, ip = "203.0.113.5") {
  const req = { ip, headers: {} };
  const res = makeRes();
  let index = 0;
  const next = () => {
    const handler = handlers[index++];
    if (handler) handler(req, res, next);
  };
  next();
  return res;
}

test("GET /api/webrtc/ice serves the configured relay and is never cached", () => {
  const iceConfig = readIceConfig({
    TURN_URLS: "turn:relay.example.com:3478",
    TURN_SECRET: "s",
  });
  const res = run(captureHandlers({ iceConfig }));
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Cache-Control"], "no-store");
  assert.equal(res.body.iceServers.length, 2);
  assert.match(res.body.iceServers[1].username, /^\d+:/);
  assert.equal(res.body.ttlSeconds, iceConfig.ttlSeconds);
});

test("GET /api/webrtc/ice mints a different credential per request", () => {
  const handlers = captureHandlers({
    iceConfig: readIceConfig({
      TURN_URLS: "turn:r.example.com:3478",
      TURN_SECRET: "s",
    }),
  });
  const a = run(handlers).body.iceServers[1];
  const b = run(handlers).body.iceServers[1];
  assert.notEqual(a.username, b.username);
  assert.notEqual(a.credential, b.credential);
});

test("GET /api/webrtc/ice falls back to the environment when no config is injected", () => {
  const res = run(captureHandlers({}));
  assert.equal(res.statusCode, 200);
  assert.ok(Array.isArray(res.body.iceServers));
  assert.ok(res.body.iceServers.length >= 1);
});

test("GET /api/webrtc/ice rate limits one address without affecting another", () => {
  const handlers = captureHandlers({ iceConfig: readIceConfig({}) });
  for (let i = 0; i < IP_RATE_LIMIT; i += 1) {
    assert.equal(run(handlers, "198.51.100.1").statusCode, 200);
  }
  const limited = run(handlers, "198.51.100.1");
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.body.error, "rate_limited");
  assert.equal(run(handlers, "198.51.100.2").statusCode, 200);
});
