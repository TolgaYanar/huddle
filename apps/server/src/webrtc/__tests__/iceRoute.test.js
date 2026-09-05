const test = require("node:test");
const assert = require("node:assert/strict");

const {
  IP_RATE_LIMIT,
  MEMBERSHIP_RATE_LIMIT,
  registerIceRoutes,
} = require("../../routes/ice");
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

async function run(handlers, ip = "203.0.113.5", request = {}) {
  const req = {
    ip,
    headers: request.headers ?? {},
    query: request.query ?? {},
  };
  const res = makeRes();
  let index = 0;
  const next = async () => {
    const handler = handlers[index++];
    if (handler) await handler(req, res, next);
  };
  await next();
  return res;
}

function turnDeps(overrides = {}) {
  const roomId = "movie-night";
  const socketId = "socket-1";
  const token = "room-capability-token";
  const socket = {
    id: socketId,
    rooms: new Set([socketId, roomId]),
    data: { iceAccessByRoom: new Map([[roomId, token]]) },
  };
  const io = {
    sockets: {
      sockets: new Map([[socketId, socket]]),
      adapter: { rooms: new Map([[roomId, new Set([socketId])]]) },
    },
  };
  return {
    roomId,
    socketId,
    token,
    request: {
      query: { roomId, socketId },
      headers: { "x-huddle-room-token": token },
    },
    deps: {
      iceConfig: readIceConfig({
        TURN_URLS: "turn:relay.example.com:3478",
        TURN_SECRET: "s",
      }),
      getIo: () => io,
      ...overrides,
    },
  };
}

test("GET /api/webrtc/ice serves the configured relay and is never cached", async () => {
  const harness = turnDeps();
  const res = await run(
    captureHandlers(harness.deps),
    "203.0.113.5",
    harness.request,
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Cache-Control"], "no-store");
  assert.equal(res.body.iceServers.length, 2);
  assert.match(res.body.iceServers[1].username, /^\d+:/);
  assert.equal(res.body.ttlSeconds, harness.deps.iceConfig.ttlSeconds);
});

test("GET /api/webrtc/ice mints a different credential per request", async () => {
  const harness = turnDeps();
  const handlers = captureHandlers(harness.deps);
  const a = (await run(handlers, "203.0.113.5", harness.request)).body
    .iceServers[1];
  const b = (await run(handlers, "203.0.113.5", harness.request)).body
    .iceServers[1];
  assert.notEqual(a.username, b.username);
  assert.notEqual(a.credential, b.credential);
});

test("GET /api/webrtc/ice never exposes TURN without a live room capability", async () => {
  const harness = turnDeps();
  const handlers = captureHandlers(harness.deps);
  const attempts = [
    {},
    {
      query: { roomId: harness.roomId, socketId: harness.socketId },
      headers: { "x-huddle-room-token": "wrong" },
    },
    {
      query: { roomId: "another-room", socketId: harness.socketId },
      headers: { "x-huddle-room-token": harness.token },
    },
    {
      query: { roomId: harness.roomId, socketId: "departed" },
      headers: { "x-huddle-room-token": harness.token },
    },
  ];
  for (const request of attempts) {
    const res = await run(handlers, "203.0.113.5", request);
    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { error: "ice_access_required" });
    assert.equal(JSON.stringify(res.body).includes("credential"), false);
  }
});

test("GET /api/webrtc/ice falls back to the environment when no config is injected", async () => {
  const res = await run(captureHandlers({}));
  assert.equal(res.statusCode, 200);
  assert.ok(Array.isArray(res.body.iceServers));
  assert.ok(res.body.iceServers.length >= 1);
});

test("GET /api/webrtc/ice rate limits one address without affecting another", async () => {
  const handlers = captureHandlers({ iceConfig: readIceConfig({}) });
  for (let i = 0; i < IP_RATE_LIMIT; i += 1) {
    assert.equal((await run(handlers, "198.51.100.1")).statusCode, 200);
  }
  const limited = await run(handlers, "198.51.100.1");
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.body.error, "rate_limited");
  assert.equal((await run(handlers, "198.51.100.2")).statusCode, 200);
});

test("GET /api/webrtc/ice also limits one verified room membership", async () => {
  const harness = turnDeps();
  const handlers = captureHandlers(harness.deps);
  for (let i = 0; i < MEMBERSHIP_RATE_LIMIT; i += 1) {
    assert.equal(
      (await run(handlers, `198.51.100.${i + 1}`, harness.request)).statusCode,
      200,
    );
  }
  const limited = await run(handlers, "198.51.100.200", harness.request);
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.body.error, "rate_limited");
});

// --- Cloudflare mode -------------------------------------------------------
// The final handler is async there, which is why the shared `run` helper
// awaits the whole middleware chain.

function cloudflareDeps(provider, overrides = {}) {
  const base = turnDeps();
  return {
    ...base,
    deps: {
      ...base.deps,
      iceConfig: readIceConfig({
        CLOUDFLARE_TURN_KEY_ID: "key-1",
        CLOUDFLARE_TURN_API_TOKEN: "token-1",
        ...overrides,
      }),
      cloudflareTurnProvider: provider,
    },
  };
}

const CLOUDFLARE_ISSUED = {
  iceServers: [
    { urls: ["stun:stun.cloudflare.com:3478"] },
    {
      urls: ["turns:turn.cloudflare.com:443?transport=tcp"],
      username: "cf-user",
      credential: "cf-credential",
    },
  ],
  ttlSeconds: 3600,
};

test("Cloudflare mode serves the issued relay behind our own STUN", async () => {
  const harness = cloudflareDeps({
    getIceServers: async () => CLOUDFLARE_ISSUED,
  });
  const res = await run(
    captureHandlers(harness.deps),
    "203.0.113.9",
    harness.request,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Cache-Control"], "no-store");
  // Our configured STUN stays first: a second reflexive source can find a
  // direct path, which spends no relay quota.
  assert.deepEqual(res.body.iceServers[0], {
    urls: harness.deps.iceConfig.stunUrls,
  });
  assert.equal(res.body.iceServers.at(-1).username, "cf-user");
  assert.equal(res.body.ttlSeconds, 3600);
});

test("Cloudflare mode degrades to STUN when no credential can be minted", async () => {
  const harness = cloudflareDeps({ getIceServers: async () => null });
  const res = await run(
    captureHandlers(harness.deps),
    "203.0.113.10",
    harness.request,
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    iceServers: [{ urls: harness.deps.iceConfig.stunUrls }],
    ttlSeconds: null,
  });
});

test("Cloudflare credentials still require a live room capability", async () => {
  let minted = 0;
  const harness = cloudflareDeps({
    getIceServers: async () => {
      minted += 1;
      return CLOUDFLARE_ISSUED;
    },
  });
  const res = await run(captureHandlers(harness.deps), "203.0.113.11", {
    query: { roomId: harness.roomId, socketId: harness.socketId },
    headers: { "x-huddle-room-token": "wrong" },
  });

  assert.equal(res.statusCode, 403);
  // Relay quota must not be spent before membership is proven.
  assert.equal(minted, 0);
});
