const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseAllowedOrigins,
  createOriginCheck,
  createCorsOptions,
} = require("../cors");

function check(originCheck, origin) {
  return new Promise((resolve, reject) => {
    originCheck(origin, (err, allowed) => {
      if (err) reject(err);
      else resolve(allowed);
    });
  });
}

test("createOriginCheck allows missing Origin header (curl/mobile) in dev and prod", async () => {
  for (const isProduction of [false, true]) {
    const originCheck = createOriginCheck({
      allowedOrigins: [],
      allowExtensionOrigins: false,
      isProduction,
    });
    assert.equal(await check(originCheck, undefined), true);
    assert.equal(await check(originCheck, ""), true);
  }
});

test("createOriginCheck with empty allowlist reflects arbitrary origins in dev", async () => {
  const originCheck = createOriginCheck({
    allowedOrigins: [],
    allowExtensionOrigins: false,
    isProduction: false,
  });
  assert.equal(await check(originCheck, "https://anything.example"), true);
});

test("createOriginCheck with empty allowlist denies browser origins in production", async () => {
  const originCheck = createOriginCheck({
    allowedOrigins: [],
    allowExtensionOrigins: false,
    isProduction: true,
  });
  assert.equal(await check(originCheck, "https://anything.example"), false);
  assert.equal(await check(originCheck, "http://localhost:3000"), false);
});

test("createOriginCheck in production allows extensions only when enabled", async () => {
  const originCheck = createOriginCheck({
    allowedOrigins: [],
    allowExtensionOrigins: true,
    isProduction: true,
  });
  assert.equal(await check(originCheck, "chrome-extension://abc"), true);
  assert.equal(await check(originCheck, "https://evil.example"), false);
});

test("createOriginCheck handles moz-extension origins per allowExtensionOrigins flag", async () => {
  const enabled = createOriginCheck({
    allowedOrigins: [],
    allowExtensionOrigins: true,
    isProduction: true,
  });
  assert.equal(await check(enabled, "moz-extension://abc"), true);

  const disabled = createOriginCheck({
    allowedOrigins: [],
    allowExtensionOrigins: false,
    isProduction: true,
  });
  assert.equal(await check(disabled, "moz-extension://abc"), false);
});

test("createOriginCheck with allowlist matches exactly and via normalization", async () => {
  const allowedOrigins = parseAllowedOrigins(
    "https://foo.example, https://bar.example",
  );
  for (const isProduction of [false, true]) {
    const originCheck = createOriginCheck({
      allowedOrigins,
      allowExtensionOrigins: false,
      isProduction,
    });
    assert.equal(await check(originCheck, "https://foo.example"), true);
    // Case-insensitive and trailing-slash-normalized.
    assert.equal(await check(originCheck, "HTTPS://Foo.Example/"), true);
    // Non-members are denied regardless of isProduction.
    assert.equal(await check(originCheck, "https://evil.example"), false);
    assert.equal(await check(originCheck, "chrome-extension://abc"), false);
  }
});

test("createCorsOptions keeps credentials and passes methods through", async () => {
  const options = createCorsOptions({
    allowedOrigins: ["https://foo.example"],
    allowExtensionOrigins: false,
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    isProduction: true,
  });
  assert.equal(options.credentials, true);
  assert.deepEqual(options.methods, ["GET", "POST", "DELETE", "OPTIONS"]);
  assert.equal(await check(options.origin, "https://foo.example"), true);
  assert.equal(await check(options.origin, "https://evil.example"), false);
});

test("createCorsOptions defaults isProduction to false and methods to GET/POST", async () => {
  const options = createCorsOptions({
    allowedOrigins: [],
    allowExtensionOrigins: false,
  });
  assert.deepEqual(options.methods, ["GET", "POST"]);
  // Empty allowlist reflects origins because isProduction defaults to false.
  assert.equal(await check(options.origin, "https://anything.example"), true);
});
