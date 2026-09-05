const test = require("node:test");
const assert = require("node:assert/strict");

const { registerHealthRoutes } = require("../routes/health");
const { readIceConfig } = require("../webrtc/iceConfig");

function readHealth(iceConfig, cloudflareTurnProvider) {
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
      cloudflareTurnProvider,
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
    credential: "n/a",
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
    credential: "n/a",
    required: true,
  });
  assert.equal(JSON.stringify(body).includes("do-not-leak"), false);
  assert.equal(JSON.stringify(body).includes("relay.example.com"), false);
});

test("health reports a Cloudflare relay that cannot mint as degraded", () => {
  const iceConfig = readIceConfig({
    CLOUDFLARE_TURN_KEY_ID: "key-1",
    CLOUDFLARE_TURN_API_TOKEN: "revoked",
  });

  // Two non-empty variables are not a working relay. Reporting "configured"
  // alone let a revoked key look healthy while every call fell back to STUN.
  const failing = readHealth(iceConfig, {
    getCredentialStatus: () => "failing",
  });
  assert.equal(failing.status, "ok", "liveness must not depend on the relay");
  assert.deepEqual(failing.webrtc, {
    status: "degraded",
    relay: "configured",
    credential: "failing",
    required: false,
  });

  const working = readHealth(iceConfig, {
    getCredentialStatus: () => "ready",
  });
  assert.equal(working.webrtc.status, "ready");
  assert.equal(working.webrtc.credential, "ready");

  // No provider wired (or none yet attempted) is honestly "unknown".
  assert.equal(readHealth(iceConfig).webrtc.credential, "unknown");
});
