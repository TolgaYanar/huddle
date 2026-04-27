const test = require("node:test");
const assert = require("node:assert/strict");

const { securityHeaders } = require("../security");

function makeReqRes() {
  const headers = {};
  const res = {
    setHeader(name, value) {
      headers[name] = value;
    },
    getHeader(name) {
      return headers[name];
    },
    get headers() {
      return headers;
    },
  };
  return { req: {}, res, headers };
}

test("securityHeaders sets baseline headers", () => {
  const middleware = securityHeaders();
  const { req, res, headers } = makeReqRes();
  let nextCalled = false;
  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(headers["X-Content-Type-Options"], "nosniff");
  assert.equal(headers["X-Frame-Options"], "DENY");
  assert.equal(headers["Referrer-Policy"], "strict-origin-when-cross-origin");
  assert.equal(headers["X-DNS-Prefetch-Control"], "off");
  assert.match(headers["Permissions-Policy"], /camera=\(\)/);
});

test("securityHeaders sets HSTS only in production", () => {
  const original = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "development";
    const middleware = securityHeaders();
    const { req, res, headers } = makeReqRes();
    middleware(req, res, () => {});
    assert.equal(headers["Strict-Transport-Security"], undefined);

    process.env.NODE_ENV = "production";
    const middleware2 = securityHeaders();
    const dev = makeReqRes();
    middleware2(dev.req, dev.res, () => {});
    assert.match(dev.headers["Strict-Transport-Security"], /max-age=/);
  } finally {
    process.env.NODE_ENV = original;
  }
});
