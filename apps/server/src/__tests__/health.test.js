const test = require("node:test");
const assert = require("node:assert/strict");

const { registerHealthRoutes } = require("../routes/health");
const { readIceConfig } = require("../webrtc/iceConfig");

function readHealth(iceConfig) {
  let handler;
  registerHealthRoutes(
    {
      get(path, candidate) {
        assert.equal(path, "/health");
        handler = candidate;
      },
    },
    {
      getIo: () => ({}),
      isDbConnected: () => true,
      iceConfig,
    },
  );

  const response = {
    body: null,
    json(body) {
      this.body = body;
    },
  };
  handler({}, response);
  return response.body;
}

test("health exposes a degraded WebRTC relay state without failing liveness", () => {
  const body = readHealth(readIceConfig({}));
  assert.equal(body.status, "ok");
  assert.deepEqual(body.webrtc, {
    status: "degraded",
    relay: "missing",
    required: false,
  });
});

test("health exposes TURN readiness without leaking relay credentials", () => {
  const body = readHealth(
    readIceConfig({
      REQUIRE_TURN: "1",
      TURN_URLS: "turn:relay.example.com:3478",
      TURN_SECRET: "do-not-leak",
    }),
  );
  assert.deepEqual(body.webrtc, {
    status: "ready",
    relay: "configured",
    required: true,
  });
  assert.equal(JSON.stringify(body).includes("do-not-leak"), false);
  assert.equal(JSON.stringify(body).includes("relay.example.com"), false);
});
