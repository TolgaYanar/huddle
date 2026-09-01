const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const {
  captureServerError,
  initSentry,
  isSentryEnabled,
  resetSentryForTests,
} = require("../sentry");

describe("server error reporting", () => {
  beforeEach(() => resetSentryForTests());

  it("stays inert without a DSN so it can ship before Sentry exists", () => {
    assert.equal(initSentry({ dsn: undefined }), false);
    assert.equal(isSentryEnabled(), false);
  });

  it("treats an empty DSN as absent", () => {
    assert.equal(initSentry({ dsn: "" }), false);
    assert.equal(isSentryEnabled(), false);
  });

  it("drops captures rather than throwing when disabled", () => {
    initSentry({ dsn: undefined });
    assert.doesNotThrow(() => captureServerError(new Error("boom")));
    assert.equal(captureServerError(new Error("boom")), false);
  });

  it("never lets a bad DSN stop the server from starting", () => {
    const logged = [];
    // An unparseable DSN makes Sentry.init throw; startup must survive it.
    const ok = initSentry({
      dsn: "not-a-dsn",
      logError: (...args) => logged.push(args),
    });
    assert.equal(ok, false);
    assert.equal(isSentryEnabled(), false);
    assert.equal(logged.length, 1);
  });

  it("initialises once and reports enabled with a valid DSN", () => {
    const dsn = "https://examplePublicKey@o0.ingest.sentry.io/0";
    assert.equal(initSentry({ dsn }), true);
    assert.equal(isSentryEnabled(), true);
    // A second call is a no-op rather than a re-init.
    assert.equal(initSentry({ dsn }), true);
  });

  it("strips request context and user from an outgoing event", () => {
    const dsn = "https://examplePublicKey@o0.ingest.sentry.io/0";
    let captured;
    const Sentry = require("@sentry/node");
    const originalInit = Sentry.init;
    Sentry.init = (options) => {
      captured = options;
    };
    try {
      initSentry({ dsn });
    } finally {
      Sentry.init = originalInit;
    }

    assert.equal(captured.sendDefaultPii, false);
    assert.equal(captured.tracesSampleRate, 0);

    const event = {
      request: {
        cookies: { huddle_session: "secret" },
        headers: { authorization: "Bearer x" },
        data: { videoUrl: "https://netflix.com/watch/1" },
        query_string: "roomId=movie-night",
        url: "https://wehuddle.tv/r/private-room?token=secret",
        fragment: "private",
        env: { REMOTE_ADDR: "127.0.0.1" },
      },
      breadcrumbs: [{ data: { url: "https://netflix.com/watch/1" } }],
      user: { id: "user-1" },
    };
    const scrubbed = captured.beforeSend(event);

    assert.equal("cookies" in scrubbed.request, false);
    assert.equal("headers" in scrubbed.request, false);
    assert.equal("data" in scrubbed.request, false);
    assert.equal("query_string" in scrubbed.request, false);
    assert.equal("url" in scrubbed.request, false);
    assert.equal("fragment" in scrubbed.request, false);
    assert.equal("env" in scrubbed.request, false);
    assert.equal("breadcrumbs" in scrubbed, false);
    assert.equal("user" in scrubbed, false);
  });
});
