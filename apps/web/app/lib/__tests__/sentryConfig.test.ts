import { describe, expect, it } from "vitest";
import { isValidSentryDsn, scrubSentryEvent } from "../../../sentryConfig";

describe("Sentry configuration", () => {
  it("accepts valid Sentry DSNs and rejects malformed values", () => {
    expect(isValidSentryDsn("https://public-key@o0.ingest.sentry.io/123")).toBe(
      true,
    );
    expect(isValidSentryDsn("not-a-dsn")).toBe(false);
    expect(isValidSentryDsn("https://sentry.io/not-a-project")).toBe(false);
  });

  it("removes request, navigation, and user context", () => {
    const event = {
      request: {
        url: "https://wehuddle.tv/r/private-room?token=secret",
        query_string: "token=secret",
        headers: { cookie: "session=secret" },
        data: { videoUrl: "https://netflix.com/watch/1" },
      },
      breadcrumbs: [{ data: { url: "https://netflix.com/watch/1" } }],
      user: { id: "user-1" },
      exception: { values: [{ type: "Error", value: "boom" }] },
    };

    expect(scrubSentryEvent(event)).toEqual({
      request: {},
      exception: { values: [{ type: "Error", value: "boom" }] },
    });
  });
});
