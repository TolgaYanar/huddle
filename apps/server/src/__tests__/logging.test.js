const test = require("node:test");
const assert = require("node:assert/strict");

const { requestId } = require("../logging");

function makeReqRes(headers = {}) {
  const responseHeaders = {};
  return {
    req: { headers },
    res: {
      setHeader(name, value) {
        responseHeaders[name] = value;
      },
      get headers() {
        return responseHeaders;
      },
    },
    responseHeaders,
  };
}

test("requestId generates a fresh id when none is provided", () => {
  const middleware = requestId();
  const { req, res, responseHeaders } = makeReqRes();
  middleware(req, res, () => {});

  assert.equal(typeof req.id, "string");
  assert.match(req.id, /^[a-f0-9]{16}$/);
  assert.equal(responseHeaders["X-Request-Id"], req.id);
  assert.equal(typeof req.log.info, "function");
  assert.equal(typeof req.log.warn, "function");
  assert.equal(typeof req.log.error, "function");
});

test("requestId echoes a sanitised X-Request-Id header from the client", () => {
  const middleware = requestId();
  const { req, res, responseHeaders } = makeReqRes({
    "x-request-id": "trace-abc123",
  });
  middleware(req, res, () => {});

  assert.equal(req.id, "trace-abc123");
  assert.equal(responseHeaders["X-Request-Id"], "trace-abc123");
});

test("requestId rejects malformed client-provided ids", () => {
  const middleware = requestId();
  const { req, res } = makeReqRes({
    "x-request-id": "bad id with spaces",
  });
  middleware(req, res, () => {});

  // Falls back to a generated id, not the malformed one.
  assert.notEqual(req.id, "bad id with spaces");
  assert.match(req.id, /^[a-f0-9]{16}$/);
});

test("requestId calls next()", () => {
  const middleware = requestId();
  const { req, res } = makeReqRes();
  let called = 0;
  middleware(req, res, () => {
    called++;
  });
  assert.equal(called, 1);
});
