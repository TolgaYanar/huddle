import { afterEach, describe, expect, it, vi } from "vitest";

import { reportError } from "../reportError";
import * as Sentry from "@sentry/nextjs";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

const ORIGINAL_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

describe("reportError", () => {
  afterEach(() => {
    if (ORIGINAL_DSN === undefined) delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    else process.env.NEXT_PUBLIC_SENTRY_DSN = ORIGINAL_DSN;
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("captures through Sentry when a valid DSN is configured", async () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN =
      "https://public-key@o0.ingest.sentry.io/123";
    const error = new Error("boom");

    await expect(reportError(error, { source: "boundary" })).resolves.toBe(
      true,
    );
    expect(Sentry.captureException).toHaveBeenCalledWith(error, {
      extra: { source: "boundary" },
    });
  });

  it("does nothing without a DSN so the SDK is never loaded", async () => {
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    await expect(reportError(new Error("boom"))).resolves.toBe(false);
  });

  it("never rejects, so failing to report cannot become a second error", async () => {
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    // Anything may be thrown in JS, not only Error instances.
    for (const thrown of [new Error("x"), "string", null, undefined, 42]) {
      await expect(reportError(thrown)).resolves.toBe(false);
    }
  });
});
