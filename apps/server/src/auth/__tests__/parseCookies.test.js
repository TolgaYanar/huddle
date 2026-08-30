const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { parseCookies } = require("../session");

describe("parseCookies", () => {
  it("parses a normal cookie header", () => {
    const out = parseCookies("a=1; huddle_session=abc; b=2");
    assert.equal(out.huddle_session, "abc");
    assert.equal(out.a, "1");
    assert.equal(out.b, "2");
  });

  it("decodes percent-escaped values", () => {
    assert.equal(parseCookies("k=a%20b").k, "a b");
  });

  it("does not throw on a malformed escape", () => {
    // decodeURIComponent("%zz") throws URIError. That propagated out of
    // getAuthUser and turned an unauthenticated request into a 500.
    let out;
    assert.doesNotThrow(() => {
      out = parseCookies("huddle_session=%zz");
    });
    assert.equal(out.huddle_session, "%zz");
  });

  it("keeps well-formed pairs when one pair is malformed", () => {
    const out = parseCookies("good=ok; bad=%E0%A4%A; other=fine");
    assert.equal(out.good, "ok");
    assert.equal(out.other, "fine");
  });

  it("returns an empty object for empty or missing headers", () => {
    assert.deepEqual(parseCookies(""), {});
    assert.deepEqual(parseCookies(undefined), {});
    assert.deepEqual(parseCookies(null), {});
  });

  it("ignores segments without an '=' and empty keys", () => {
    const out = parseCookies("novalue; =orphan; k=v");
    assert.deepEqual(Object.keys(out), ["k"]);
  });
});
