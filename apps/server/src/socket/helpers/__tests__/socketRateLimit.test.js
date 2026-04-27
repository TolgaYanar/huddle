const test = require("node:test");
const assert = require("node:assert/strict");

const { createSocketRateLimiter } = require("../socketRateLimit");

test("allows up to max hits in the window", () => {
  const limiter = createSocketRateLimiter({ windowMs: 1000, max: 3 });
  assert.equal(limiter(), true);
  assert.equal(limiter(), true);
  assert.equal(limiter(), true);
  assert.equal(limiter(), false);
});

test("hits older than the window do not count", async () => {
  const limiter = createSocketRateLimiter({ windowMs: 50, max: 2 });
  assert.equal(limiter(), true);
  assert.equal(limiter(), true);
  assert.equal(limiter(), false);

  await new Promise((r) => setTimeout(r, 60));

  assert.equal(limiter(), true);
});

test("rejects invalid configuration", () => {
  assert.throws(() => createSocketRateLimiter({ windowMs: 0, max: 1 }));
  assert.throws(() => createSocketRateLimiter({ windowMs: 1000, max: 0 }));
  assert.throws(() => createSocketRateLimiter({ windowMs: -1, max: 1 }));
  assert.throws(() => createSocketRateLimiter({ windowMs: 1000, max: NaN }));
});

test("each instance has its own independent bucket", () => {
  const a = createSocketRateLimiter({ windowMs: 1000, max: 1 });
  const b = createSocketRateLimiter({ windowMs: 1000, max: 1 });
  assert.equal(a(), true);
  assert.equal(b(), true);
  assert.equal(a(), false);
  assert.equal(b(), false);
});
