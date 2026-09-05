const test = require("node:test");
const assert = require("node:assert/strict");

const {
  CREDENTIALS_URL,
  MAX_TTL_SECONDS,
  MIN_REMAINING_SECONDS,
  REFRESH_FRACTION,
  createCloudflareTurnProvider,
} = require("../cloudflareTurn");

const ISSUED = {
  iceServers: [
    { urls: ["stun:stun.cloudflare.com:3478"] },
    {
      urls: ["turn:turn.cloudflare.com:3478?transport=udp"],
      username: "u",
      credential: "c",
    },
  ],
};

function jsonResponse(body, status = 201) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function makeProvider(overrides = {}) {
  const calls = [];
  const errors = [];
  let clock = 1_700_000_000_000;
  const fetchImpl =
    overrides.fetchImpl ??
    (async (url, init) => {
      calls.push({ url, init });
      return jsonResponse(ISSUED);
    });
  const provider = createCloudflareTurnProvider({
    keyId: "key-1",
    apiToken: "token-1",
    ttlSeconds: overrides.ttlSeconds ?? 3600,
    fetchImpl,
    timeoutMs: overrides.timeoutMs ?? 50,
    now: () => clock,
    onError: (message) => errors.push(message),
  });
  return {
    provider,
    calls,
    errors,
    advance: (ms) => {
      clock += ms;
    },
  };
}

test("mints over the documented Cloudflare endpoint with the bearer token", async () => {
  const { provider, calls } = makeProvider();
  const result = await provider.getIceServers();

  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    "https://rtc.live.cloudflare.com/v1/turn/keys/key-1/credentials/generate-ice-servers",
  );
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.Authorization, "Bearer token-1");
  assert.deepEqual(JSON.parse(calls[0].init.body), { ttl: 3600 });
  assert.deepEqual(result.iceServers, ISSUED.iceServers);
  assert.equal(result.ttlSeconds, 3600);
});

test("a key id with a slash cannot escape the credentials path", () => {
  assert.equal(
    CREDENTIALS_URL("../../evil"),
    "https://rtc.live.cloudflare.com/v1/turn/keys/..%2F..%2Fevil/credentials/generate-ice-servers",
  );
});

test("reuses one credential instead of calling Cloudflare per room join", async () => {
  const { provider, calls, advance } = makeProvider();
  await provider.getIceServers();
  advance(60_000);
  const second = await provider.getIceServers();

  assert.equal(calls.length, 1, "second join must not mint again");
  // The client refreshes against what is actually left, not the full TTL.
  assert.equal(second.ttlSeconds, 3600 - 60);
});

test("concurrent cold-start joins collapse onto a single request", async () => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let calls = 0;
  const { provider } = makeProvider({
    fetchImpl: async () => {
      calls += 1;
      await gate;
      return jsonResponse(ISSUED);
    },
  });

  const all = Promise.all([
    provider.getIceServers(),
    provider.getIceServers(),
    provider.getIceServers(),
  ]);
  release();
  const results = await all;

  assert.equal(calls, 1);
  for (const result of results)
    assert.deepEqual(result.iceServers, ISSUED.iceServers);
});

test("refreshes in the background once the credential is stale but still valid", async () => {
  const { provider, calls, advance } = makeProvider();
  await provider.getIceServers();

  advance(3600 * 1000 * REFRESH_FRACTION + 1000);
  const stale = await provider.getIceServers();
  // Served immediately from cache: no room join waits on Cloudflare.
  assert.ok(stale);
  // The background refresh was started rather than awaited.
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.length, 2);
});

test("an expired credential is never served, even though a fresh mint fails", async () => {
  let attempt = 0;
  const { provider, errors, advance } = makeProvider({
    fetchImpl: async () => {
      attempt += 1;
      if (attempt === 1) return jsonResponse(ISSUED);
      return jsonResponse({ error: "revoked" }, 401);
    },
  });
  await provider.getIceServers();

  advance(3600 * 1000 + 1000);
  // A TURN server rejects an expired credential, which is worse than STUN:
  // the client would stop looking for another path.
  assert.equal(await provider.getIceServers(), null);
  assert.match(errors.at(-1), /HTTP 401/);
});

test("a failed first mint degrades to null rather than throwing", async () => {
  const cases = [
    { fetchImpl: async () => jsonResponse({}, 500), match: /HTTP 500/ },
    {
      fetchImpl: async () => {
        throw new TypeError("network down");
      },
      match: /network down/,
    },
    {
      fetchImpl: async () => jsonResponse({ iceServers: [] }),
      match: /no usable iceServers/,
    },
    {
      fetchImpl: async () => jsonResponse({ iceServers: [{ urls: [] }] }),
      match: /no usable iceServers/,
    },
  ];

  for (const { fetchImpl, match } of cases) {
    const { provider, errors } = makeProvider({ fetchImpl });
    assert.equal(await provider.getIceServers(), null);
    assert.match(errors.at(-1), match);
  }
});

test("accepts the single-object iceServers shape Cloudflare examples use", async () => {
  const { provider } = makeProvider({
    fetchImpl: async () =>
      jsonResponse({
        iceServers: { urls: ["turn:x:3478"], username: "u", credential: "c" },
      }),
  });
  const result = await provider.getIceServers();
  assert.deepEqual(result.iceServers, [
    { urls: ["turn:x:3478"], username: "u", credential: "c" },
  ]);
});

test("a hung request aborts instead of holding the first room join open", async () => {
  const { provider, errors } = makeProvider({
    fetchImpl: (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      }),
  });
  // The real timer fires on its own; this asserts the abort path is wired.
  const result = await provider.getIceServers();
  assert.equal(result, null);
  assert.match(errors.at(-1), /timed out/);
});

test("Cloudflare's documented ceiling is 48 hours", () => {
  assert.equal(MAX_TTL_SECONDS, 48 * 60 * 60);
});

test("never serves a credential too short to survive the client's refresh", async () => {
  // The client refreshes at 80% of the TTL it is told but never sooner than
  // 30 s, so a credential with seconds left dies on a live peer before another
  // is requested. A server that sat idle through the refresh window used to
  // hand exactly that to its next joiner.
  const { provider, calls, advance } = makeProvider();
  const first = await provider.getIceServers();
  assert.equal(first.ttlSeconds, 3600);

  advance((3600 - 1) * 1000);
  const late = await provider.getIceServers();

  assert.equal(
    calls.length,
    2,
    "the stale credential must be replaced, not served",
  );
  assert.equal(late.ttlSeconds, 3600);
  assert.ok(late.ttlSeconds >= MIN_REMAINING_SECONDS);
});

test("still serves a short credential when a fresh mint fails", async () => {
  let attempt = 0;
  const { provider, advance } = makeProvider({
    fetchImpl: async () => {
      attempt += 1;
      if (attempt === 1) return jsonResponse(ISSUED);
      return jsonResponse({ error: "upstream" }, 503);
    },
  });
  await provider.getIceServers();

  advance((3600 - 60) * 1000);
  const degraded = await provider.getIceServers();

  // 60 seconds of relay beats none: the client refreshes on its own and the
  // retry may succeed by then.
  assert.ok(degraded);
  assert.equal(degraded.ttlSeconds, 60);
  assert.equal(provider.getCredentialStatus(), "ready");
});

test("reports what the last mint achieved, for /health", async () => {
  const { provider, advance } = makeProvider();
  assert.equal(provider.getCredentialStatus(), "unknown");
  await provider.getIceServers();
  assert.equal(provider.getCredentialStatus(), "ready");
  advance(3600 * 1000 + 1000);
  assert.equal(
    provider.getCredentialStatus(),
    "unknown",
    "expired is not ready",
  );

  const { provider: broken } = makeProvider({
    fetchImpl: async () => jsonResponse({ error: "revoked" }, 401),
  });
  assert.equal(await broken.getIceServers(), null);
  assert.equal(broken.getCredentialStatus(), "failing");
});
