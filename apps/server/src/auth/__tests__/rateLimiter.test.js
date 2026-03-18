const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const { createRateLimiter } = require("../rateLimiter");

// Minimal Express-like request/response mocks.
function makeReq(ip = "127.0.0.1") {
  return { ip, headers: {}, connection: { remoteAddress: ip } };
}

function makeRes() {
  const res = {
    _status: 200,
    _body: null,
    _headers: {},
    status(code) {
      res._status = code;
      return res;
    },
    json(body) {
      res._body = body;
      return res;
    },
    set(key, value) {
      res._headers[key] = value;
      return res;
    },
  };
  return res;
}

describe("createRateLimiter", () => {
  describe("basic limiting", () => {
    it("allows requests up to the max", () => {
      const limiter = createRateLimiter({ windowMs: 60_000, max: 3 });
      const req = makeReq("10.0.0.1");
      const nextCalls = [];
      const next = () => nextCalls.push(true);

      limiter(req, makeRes(), next);
      limiter(req, makeRes(), next);
      limiter(req, makeRes(), next);

      assert.equal(nextCalls.length, 3);
    });

    it("blocks the (max + 1)th request with 429", () => {
      const limiter = createRateLimiter({ windowMs: 60_000, max: 3 });
      const req = makeReq("10.0.0.2");
      const next = () => {};

      for (let i = 0; i < 3; i++) limiter(req, makeRes(), next);

      const res = makeRes();
      let nextCalled = false;
      limiter(req, res, () => { nextCalled = true; });

      assert.equal(nextCalled, false);
      assert.equal(res._status, 429);
      assert.equal(res._body.error, "rate_limited");
    });

    it("sets Retry-After header on 429", () => {
      const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });
      const req = makeReq("10.0.0.3");
      const next = () => {};

      limiter(req, makeRes(), next); // consume the 1 slot

      const res = makeRes();
      limiter(req, res, next);

      assert.ok(
        typeof res._headers["Retry-After"] === "string",
        "Retry-After should be a string header"
      );
      assert.ok(
        Number(res._headers["Retry-After"]) > 0,
        "Retry-After should be positive"
      );
    });

    it("uses a custom error message when provided", () => {
      const limiter = createRateLimiter({
        windowMs: 60_000,
        max: 1,
        message: "too_many_login_attempts",
      });
      const req = makeReq("10.0.0.4");
      const next = () => {};

      limiter(req, makeRes(), next);

      const res = makeRes();
      limiter(req, res, next);

      assert.equal(res._body.error, "too_many_login_attempts");
    });
  });

  describe("window expiry", () => {
    it("allows requests again after the window resets", async () => {
      const WINDOW = 50; // 50 ms so the test doesn't take long
      const limiter = createRateLimiter({ windowMs: WINDOW, max: 1 });
      const req = makeReq("10.0.0.5");
      const next = () => {};

      limiter(req, makeRes(), next); // use the 1 slot

      // Wait for the window to expire.
      await new Promise((r) => setTimeout(r, WINDOW + 10));

      const res = makeRes();
      let nextCalled = false;
      limiter(req, res, () => { nextCalled = true; });

      assert.equal(nextCalled, true, "request after window reset should pass");
      assert.equal(res._status, 200);
    });
  });

  describe("IP isolation", () => {
    it("counts each IP independently", () => {
      const limiter = createRateLimiter({ windowMs: 60_000, max: 2 });
      const reqA = makeReq("1.1.1.1");
      const reqB = makeReq("2.2.2.2");
      const next = () => {};

      limiter(reqA, makeRes(), next);
      limiter(reqA, makeRes(), next);

      // A is at limit, B is not.
      const resA = makeRes();
      limiter(reqA, resA, next);
      assert.equal(resA._status, 429);

      const resB = makeRes();
      let nextCalledB = false;
      limiter(reqB, resB, () => { nextCalledB = true; });
      assert.equal(nextCalledB, true);
    });
  });

  describe("fallback IP extraction", () => {
    it("uses x-forwarded-for when req.ip is absent", () => {
      const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });
      const req = {
        ip: undefined,
        headers: { "x-forwarded-for": "5.5.5.5, 6.6.6.6" },
        connection: {},
      };
      const next = () => {};

      limiter(req, makeRes(), next); // consume slot for 5.5.5.5

      const res = makeRes();
      limiter(req, res, next);
      assert.equal(res._status, 429);
    });
  });
});
