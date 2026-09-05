const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_STUN_URLS,
  DEFAULT_TTL_SECONDS,
  MAX_TTL_SECONDS,
  MIN_TTL_SECONDS,
  buildIceResponse,
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
