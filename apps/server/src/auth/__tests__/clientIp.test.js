const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  CLIENT_IP_HEADER,
  PROXY_SECRET_HEADER,
  readProxySecret,
  resolveClientIp,
  createClientIpResolver,
} = require("../clientIp");

const SECRET = "a".repeat(64);

function makeReq(headers = {}, ip = "52.59.240.157") {
  return { ip, headers, socket: { remoteAddress: "100.64.0.1" } };
}

describe("readProxySecret", () => {
  it("is null when unset or blank", () => {
    assert.equal(readProxySecret({}), null);
    assert.equal(readProxySecret({ PROXY_SHARED_SECRET: "   " }), null);
  });

  it("rejects a short secret with a warning", () => {
    const warnings = [];
    const secret = readProxySecret({ PROXY_SHARED_SECRET: "short" }, (m) =>
      warnings.push(m),
    );
    assert.equal(secret, null);
    assert.equal(warnings.length, 1);
    assert.doesNotMatch(warnings[0], /short"/);
  });

  it("returns a long enough secret, trimmed", () => {
    assert.equal(
      readProxySecret({ PROXY_SHARED_SECRET: ` ${SECRET} ` }),
      SECRET,
    );
  });
});

describe("resolveClientIp", () => {
  it("uses req.ip when no secret is configured, whatever the headers say", () => {
    const req = makeReq({
      [PROXY_SECRET_HEADER]: SECRET,
      [CLIENT_IP_HEADER]: "88.254.90.217",
    });
    assert.equal(resolveClientIp(req, { secret: null }), "52.59.240.157");
  });

  it("uses the forwarded address when the secret matches", () => {
    const req = makeReq({
      [PROXY_SECRET_HEADER]: SECRET,
      [CLIENT_IP_HEADER]: "88.254.90.217",
    });
    assert.equal(resolveClientIp(req, { secret: SECRET }), "88.254.90.217");
  });

  it("accepts an IPv6 forwarded address", () => {
    const req = makeReq({
      [PROXY_SECRET_HEADER]: SECRET,
      [CLIENT_IP_HEADER]: "2001:db8::1",
    });
    assert.equal(resolveClientIp(req, { secret: SECRET }), "2001:db8::1");
  });

  it("ignores the forwarded address on a wrong secret and reports it", () => {
    let mismatches = 0;
    const req = makeReq({
      [PROXY_SECRET_HEADER]: "b".repeat(64),
      [CLIENT_IP_HEADER]: "203.0.113.9",
    });
    const ip = resolveClientIp(req, {
      secret: SECRET,
      onMismatch: () => mismatches++,
    });
    assert.equal(ip, "52.59.240.157");
    assert.equal(mismatches, 1);
  });

  it("treats a secret of a different length as a mismatch without throwing", () => {
    let mismatches = 0;
    const req = makeReq({
      [PROXY_SECRET_HEADER]: "x",
      [CLIENT_IP_HEADER]: "203.0.113.9",
    });
    const ip = resolveClientIp(req, {
      secret: SECRET,
      onMismatch: () => mismatches++,
    });
    assert.equal(ip, "52.59.240.157");
    assert.equal(mismatches, 1);
  });

  it("ignores the forwarded address when no secret header is sent", () => {
    const req = makeReq({ [CLIENT_IP_HEADER]: "203.0.113.9" });
    assert.equal(resolveClientIp(req, { secret: SECRET }), "52.59.240.157");
  });

  it("falls back when the forwarded value is not an address", () => {
    for (const value of ["", "not-an-ip", "1.2.3.4, 5.6.7.8"]) {
      const req = makeReq({
        [PROXY_SECRET_HEADER]: SECRET,
        [CLIENT_IP_HEADER]: value,
      });
      assert.equal(resolveClientIp(req, { secret: SECRET }), "52.59.240.157");
    }
  });

  it("falls back to the socket address when req.ip is absent", () => {
    const req = { headers: {}, socket: { remoteAddress: "100.64.0.1" } };
    assert.equal(resolveClientIp(req, { secret: null }), "100.64.0.1");
  });
});

describe("createClientIpResolver", () => {
  it("throttles the mismatch warning and never includes header values", () => {
    const warnings = [];
    let t = 0;
    const resolve = createClientIpResolver({
      secret: SECRET,
      warn: (m) => warnings.push(m),
      now: () => t,
    });
    const req = makeReq({
      [PROXY_SECRET_HEADER]: "wrong",
      [CLIENT_IP_HEADER]: "203.0.113.9",
    });

    resolve(req);
    resolve(req);
    t += 61_000;
    resolve(req);

    assert.equal(warnings.length, 2);
    for (const w of warnings) {
      assert.doesNotMatch(w, /203\.0\.113\.9|wrong|52\.59/);
    }
  });
});
