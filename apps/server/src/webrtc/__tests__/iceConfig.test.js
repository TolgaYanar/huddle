const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_STUN_URLS,
  DEFAULT_TTL_SECONDS,
  MAX_TTL_SECONDS,
  MIN_TTL_SECONDS,
  assertIceReadiness,
  buildIceResponse,
  getIceReadiness,
  mintTurnCredential,
  readIceConfig,
} = require("../iceConfig");

const TURN_URLS =
  "turn:relay.example.com:3478?transport=udp, turns:relay.example.com:5349?transport=tcp";

test("readIceConfig: nothing configured means STUN only, no warnings", () => {
  const config = readIceConfig({});
  assert.equal(config.mode, "none");
  assert.deepEqual(config.stunUrls, DEFAULT_STUN_URLS);
  assert.deepEqual(config.turnUrls, []);
  assert.equal(config.ttlSeconds, DEFAULT_TTL_SECONDS);
  assert.deepEqual(config.warnings, []);
  assert.equal(config.requireTurn, false);
});

test("TURN readiness reports degraded safely, or fails fast when required", () => {
  const optional = readIceConfig({});
  assert.deepEqual(getIceReadiness(optional), {
    status: "degraded",
    relay: "missing",
    credential: "n/a",
    required: false,
  });
  assert.doesNotThrow(() => assertIceReadiness(optional));

  const required = readIceConfig({ REQUIRE_TURN: "true" });
  assert.equal(required.requireTurn, true);
  assert.deepEqual(getIceReadiness(required), {
    status: "degraded",
    relay: "missing",
    credential: "n/a",
    required: true,
  });
  assert.throws(() => assertIceReadiness(required), /no usable TURN relay/);

  const ready = readIceConfig({
    REQUIRE_TURN: "1",
    TURN_URLS,
    TURN_SECRET: "secret",
  });
  assert.deepEqual(assertIceReadiness(ready), {
    status: "ready",
    relay: "configured",
    credential: "n/a",
    required: true,
  });
});

test("readIceConfig: invalid REQUIRE_TURN values fail closed with a warning", () => {
  const config = readIceConfig({ REQUIRE_TURN: "sometimes" });
  assert.equal(config.requireTurn, true);
  assert.match(config.warnings[0], /REQUIRE_TURN/);
  assert.throws(() => assertIceReadiness(config), /no usable TURN relay/);
});

test("readIceConfig: TURN_URLS + TURN_SECRET selects the HMAC scheme", () => {
  const config = readIceConfig({ TURN_URLS, TURN_SECRET: " s3cret " });
  assert.equal(config.mode, "hmac");
  assert.equal(config.secret, "s3cret");
  assert.deepEqual(config.turnUrls, [
    "turn:relay.example.com:3478?transport=udp",
    "turns:relay.example.com:5349?transport=tcp",
  ]);
  assert.equal(config.username, null);
  assert.deepEqual(config.warnings, []);
});

test("readIceConfig: a fixed username/credential pair is served as static", () => {
  const config = readIceConfig({
    TURN_URLS,
    TURN_USERNAME: "user",
    TURN_CREDENTIAL: "pass",
  });
  assert.equal(config.mode, "static");
  assert.equal(config.username, "user");
  assert.equal(config.credential, "pass");
  assert.equal(config.secret, null);
});

test("readIceConfig: production never exposes a static TURN password", () => {
  const config = readIceConfig({
    NODE_ENV: "production",
    TURN_URLS,
    TURN_USERNAME: "user",
    TURN_CREDENTIAL: "pass",
  });
  assert.equal(config.mode, "none");
  assert.deepEqual(config.turnUrls, []);
  assert.ok(
    config.warnings.some((warning) => /disabled in production/.test(warning)),
  );
  assert.deepEqual(buildIceResponse(config), {
    iceServers: [{ urls: DEFAULT_STUN_URLS }],
    ttlSeconds: null,
  });

  const required = readIceConfig({
    NODE_ENV: "production",
    REQUIRE_TURN: "1",
    TURN_URLS,
    TURN_USERNAME: "user",
    TURN_CREDENTIAL: "pass",
  });
  assert.throws(() => assertIceReadiness(required), /no usable TURN relay/);
});

test("readIceConfig: the secret wins over a static pair, and says so", () => {
  const config = readIceConfig({
    TURN_URLS,
    TURN_SECRET: "s",
    TURN_USERNAME: "user",
    TURN_CREDENTIAL: "pass",
  });
  assert.equal(config.mode, "hmac");
  assert.equal(config.warnings.length, 1);
  assert.match(
    config.warnings[0],
    /TURN_USERNAME\/TURN_CREDENTIAL are ignored/,
  );
});

test("readIceConfig: relay URLs without any credential disable the relay loudly", () => {
  const config = readIceConfig({ TURN_URLS });
  assert.equal(config.mode, "none");
  assert.deepEqual(config.turnUrls, []);
  assert.equal(config.warnings.length, 1);
  assert.match(config.warnings[0], /serving STUN only/);
});

test("readIceConfig: credentials without URLs are flagged rather than silently unused", () => {
  const config = readIceConfig({ TURN_SECRET: "s" });
  assert.equal(config.mode, "none");
  assert.match(config.warnings[0], /TURN_URLS is empty/);
});

test("readIceConfig: entries with the wrong scheme are dropped one by one", () => {
  const config = readIceConfig({
    TURN_URLS:
      "turn:ok.example.com:3478,https://not-a-relay,stun:wrong-list.example.com:3478,turn:",
    TURN_SECRET: "s",
    STUN_URLS: "stun:custom.example.com:3478,turn:not-stun.example.com:3478",
  });
  assert.equal(config.mode, "hmac");
  assert.deepEqual(config.turnUrls, ["turn:ok.example.com:3478"]);
  assert.deepEqual(config.stunUrls, ["stun:custom.example.com:3478"]);
  const rejected = config.warnings.filter((w) => /ignored/.test(w));
  assert.equal(rejected.length, 4);
});

test("readIceConfig: malformed TURN URIs cannot satisfy required readiness", () => {
  const malformed = [
    "turn:relay.example.com:notaport",
    "turn:////",
    "turn:relay.example.com:70000",
    "turn:relay.example.com:3478?transport=bogus",
    "turn:999.999.999.999:3478",
    "turn:2001:db8::1:3478",
  ];

  for (const url of malformed) {
    const config = readIceConfig({
      REQUIRE_TURN: "1",
      TURN_URLS: url,
      TURN_SECRET: "secret",
    });
    assert.equal(config.mode, "none", url);
    assert.deepEqual(config.turnUrls, [], url);
    assert.ok(
      config.warnings.some((warning) => warning.includes(url)),
      url,
    );
    assert.throws(() => assertIceReadiness(config), /no usable TURN relay/);
  }
});

test("readIceConfig: accepts valid DNS, IPv4, and bracketed IPv6 TURN URIs", () => {
  const urls = [
    "turn:relay.example.com",
    "turn:192.0.2.10:3478?transport=udp",
    "turns:[2001:db8::1]:5349?transport=tcp",
  ];
  const config = readIceConfig({
    REQUIRE_TURN: "1",
    TURN_URLS: urls.join(","),
    TURN_SECRET: "secret",
  });

  assert.equal(config.mode, "hmac");
  assert.deepEqual(config.turnUrls, urls);
  assert.equal(assertIceReadiness(config).status, "ready");
});

test("readIceConfig: TTL is a whole number of seconds, clamped to a sane range", () => {
  assert.equal(readIceConfig({ TURN_TTL_SECONDS: "3600" }).ttlSeconds, 3600);

  const tooShort = readIceConfig({ TURN_TTL_SECONDS: "5" });
  assert.equal(tooShort.ttlSeconds, MIN_TTL_SECONDS);
  assert.match(tooShort.warnings[0], /clamped/);

  const tooLong = readIceConfig({
    TURN_TTL_SECONDS: String(MAX_TTL_SECONDS * 10),
  });
  assert.equal(tooLong.ttlSeconds, MAX_TTL_SECONDS);

  const garbage = readIceConfig({ TURN_TTL_SECONDS: "one hour" });
  assert.equal(garbage.ttlSeconds, DEFAULT_TTL_SECONDS);
  assert.match(garbage.warnings[0], /not a whole number/);

  const fractional = readIceConfig({ TURN_TTL_SECONDS: "3600.5" });
  assert.equal(fractional.ttlSeconds, DEFAULT_TTL_SECONDS);
});

test("mintTurnCredential: TURN REST API format, known-answer vector", () => {
  // username = "<expiry>:<label>", credential = base64(HMAC-SHA1(secret, username)).
  // This is what coturn verifies with `use-auth-secret`; switching the hash
  // or encoding would silently break every relay.
  const minted = mintTurnCredential({
    secret: "test-secret",
    ttlSeconds: 600,
    now: 1700000000 * 1000,
    label: "abc123",
  });
  assert.equal(minted.username, "1700000600:abc123");
  assert.equal(minted.expiresAt, 1700000600);
  assert.equal(minted.credential, "JFF48IDTAgpFnsP9gjP5+FaqOt0=");
});

test("mintTurnCredential: the label is random and never a user id", () => {
  const a = mintTurnCredential({ secret: "s", ttlSeconds: 600 });
  const b = mintTurnCredential({ secret: "s", ttlSeconds: 600 });
  assert.notEqual(a.username, b.username);
  assert.match(a.username, /^\d+:[0-9a-f]{16}$/);
});

test("buildIceResponse: HMAC mode ships STUN + a minted relay entry with its TTL", () => {
  const config = readIceConfig({
    TURN_URLS,
    TURN_SECRET: "s",
    TURN_TTL_SECONDS: "3600",
  });
  const body = buildIceResponse(config, { now: 1700000000 * 1000, label: "x" });
  assert.equal(body.ttlSeconds, 3600);
  assert.equal(body.iceServers.length, 2);
  assert.deepEqual(body.iceServers[0], { urls: DEFAULT_STUN_URLS });
  assert.equal(body.iceServers[1].username, "1700003600:x");
  assert.equal(typeof body.iceServers[1].credential, "string");
  assert.deepEqual(body.iceServers[1].urls, config.turnUrls);
  // The shared secret must never leave the server.
  assert.equal(JSON.stringify(body).includes('"s"'), false);
});

test("buildIceResponse: static mode has nothing to refresh", () => {
  const config = readIceConfig({
    TURN_URLS,
    TURN_USERNAME: "u",
    TURN_CREDENTIAL: "p",
  });
  const body = buildIceResponse(config);
  assert.equal(body.ttlSeconds, null);
  assert.deepEqual(body.iceServers[1], {
    urls: config.turnUrls,
    username: "u",
    credential: "p",
  });
});

test("buildIceResponse: no relay means exactly the STUN entry", () => {
  const body = buildIceResponse(readIceConfig({}));
  assert.deepEqual(body, {
    iceServers: [{ urls: DEFAULT_STUN_URLS }],
    ttlSeconds: null,
  });
});

test("readIceConfig: the Cloudflare pair selects the cloudflare mode", () => {
  const config = readIceConfig({
    CLOUDFLARE_TURN_KEY_ID: " key-1 ",
    CLOUDFLARE_TURN_API_TOKEN: " token-1 ",
  });
  assert.equal(config.mode, "cloudflare");
  assert.equal(config.cloudflareKeyId, "key-1");
  assert.equal(config.cloudflareApiToken, "token-1");
  // Shared-secret fields belong to the other modes only.
  assert.deepEqual(config.turnUrls, []);
  assert.equal(config.secret, null);
  assert.deepEqual(config.warnings, []);
});

test("readIceConfig: half a Cloudflare pair is refused rather than half-used", () => {
  for (const env of [
    { CLOUDFLARE_TURN_KEY_ID: "key-1" },
    { CLOUDFLARE_TURN_API_TOKEN: "token-1" },
  ]) {
    const config = readIceConfig(env);
    assert.equal(config.mode, "none");
    assert.match(config.warnings[0], /must both be set/);
  }
});

test("readIceConfig: Cloudflare wins over shared-secret settings, and says so", () => {
  const config = readIceConfig({
    CLOUDFLARE_TURN_KEY_ID: "key-1",
    CLOUDFLARE_TURN_API_TOKEN: "token-1",
    TURN_URLS: "turn:relay.example.com:3478",
    TURN_SECRET: "s",
  });
  assert.equal(config.mode, "cloudflare");
  assert.equal(config.secret, null);
  assert.equal(config.warnings.length, 1);
  assert.match(config.warnings[0], /TURN_URLS\/TURN_SECRET.*are ignored/);
});

test("readIceConfig: a TTL beyond Cloudflare's 48 hour ceiling is clamped", () => {
  const config = readIceConfig({
    CLOUDFLARE_TURN_KEY_ID: "key-1",
    CLOUDFLARE_TURN_API_TOKEN: "token-1",
    TURN_TTL_SECONDS: String(5 * 24 * 60 * 60),
  });
  assert.equal(config.ttlSeconds, 48 * 60 * 60);
  assert.match(config.warnings[0], /Cloudflare maximum; clamped/);
});

test("readIceConfig: Cloudflare counts as a configured relay for readiness", () => {
  const config = readIceConfig({
    CLOUDFLARE_TURN_KEY_ID: "key-1",
    CLOUDFLARE_TURN_API_TOKEN: "token-1",
    REQUIRE_TURN: "1",
  });
  assert.deepEqual(getIceReadiness(config), {
    status: "ready",
    relay: "configured",
    credential: "unknown",
    required: true,
  });
  // Production must be allowed to boot on Cloudflare alone.
  assert.doesNotThrow(() => assertIceReadiness(config));
});

test("readIceConfig: a Cloudflare key that cannot mint is reported as degraded", () => {
  const config = readIceConfig({
    CLOUDFLARE_TURN_KEY_ID: "key-1",
    CLOUDFLARE_TURN_API_TOKEN: "revoked",
  });
  // Configuration alone cannot tell a live key from a revoked one, so /health
  // must not claim a working relay merely because two variables are set.
  assert.deepEqual(getIceReadiness(config, "failing"), {
    status: "degraded",
    relay: "configured",
    credential: "failing",
    required: false,
  });
  assert.equal(getIceReadiness(config, "ready").status, "ready");
});

test("readIceConfig: the credential field is meaningless outside Cloudflare", () => {
  const hmac = readIceConfig({
    TURN_URLS: "turn:relay.example.com:3478",
    TURN_SECRET: "s",
  });
  // hmac credentials are computed locally, so there is nothing to report.
  assert.equal(getIceReadiness(hmac, "failing").credential, "n/a");
  assert.equal(getIceReadiness(hmac, "failing").status, "ready");
});
