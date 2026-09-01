import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSocketSender, createTelemetry } from "../telemetry";

let sendPayload: ReturnType<typeof vi.fn>;
let sendMessage: ReturnType<typeof vi.fn>;

function lastBody() {
  return JSON.parse(String(sendPayload.mock.calls.at(-1)?.[0] ?? "{}"));
}

function createCollector() {
  return createTelemetry(sendPayload as (payload: string) => Promise<void>);
}

describe("extension telemetry", () => {
  beforeEach(() => {
    sendPayload = vi.fn(() => Promise.resolve());
    sendMessage = vi.fn((_message, callback) => callback({ ok: true }));
    vi.stubGlobal("chrome", {
      runtime: {
        getManifest: () => ({ version: "1.2.0" }),
        sendMessage,
        lastError: undefined,
      },
    });
    // Each call must differ, otherwise a session rotation would be invisible
    // and the rotation test below would pass without testing anything.
    let seed = 0;
    vi.stubGlobal("crypto", {
      getRandomValues: (a: Uint8Array) => a.fill(++seed),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends nothing when nothing was measured", () => {
    const t = createCollector();
    t.flush();
    expect(sendPayload).not.toHaveBeenCalled();
  });

  it("sends an anonymous cumulative summary", () => {
    const t = createCollector();
    t.record("hardSeeks");
    t.record("hardSeeks");
    t.flush();

    const body = lastBody();
    expect(body.source).toBe("extension");
    expect(body.platform).toBe("netflix");
    expect(body.hardSeeks).toBe(2);
    // The privacy boundary: nothing that identifies a viewer or the content.
    for (const forbidden of ["roomId", "userId", "socketId", "url", "title"]) {
      expect(forbidden in body).toBe(false);
    }
  });

  it("attributes a summary to the active platform", () => {
    const t = createTelemetry(
      sendPayload as (payload: string) => Promise<void>,
      "prime",
    );
    t.record("playerFound");
    t.flush();
    expect(lastBody().platform).toBe("prime");
  });

  it("includes the extension version as a safe release identifier", () => {
    const t = createCollector();
    t.record("hardSeeks");
    t.flush();
    expect(lastBody().release).toBe("1.2.0");
  });

  it("emits over the socket the extension already holds", async () => {
    // A content script fetch would be bound to netflix.com's origin and
    // rejected by CORS; the socket is not subject to CORS, so it needs no
    // host permission at all.
    const emit = vi.fn();
    const send = createSocketSender(() => ({ connected: true, emit }));
    await send('{"hardSeeks":1}');
    expect(emit).toHaveBeenCalledWith("telemetry_sync", { hardSeeks: 1 });
  });

  it("rejects rather than emitting when the socket is down", async () => {
    const emit = vi.fn();
    const send = createSocketSender(() => ({ connected: false, emit }));
    await expect(send('{"hardSeeks":1}')).rejects.toThrow();
    expect(emit).not.toHaveBeenCalled();
  });

  it("rejects when there is no socket at all", async () => {
    const send = createSocketSender(() => null);
    await expect(send('{"hardSeeks":1}')).rejects.toThrow();
  });

  it("turns a synchronous socket emit failure into a rejected delivery", async () => {
    const send = createSocketSender(() => ({
      connected: true,
      emit: () => {
        throw new Error("transport failed");
      },
    }));
    await expect(send('{"hardSeeks":1}')).rejects.toThrow("transport failed");
  });

  it("increases the sequence so a late flush cannot overwrite a newer one", () => {
    const t = createCollector();
    t.record("hardSeeks");
    t.flush();
    const first = lastBody().sequence;

    t.record("hardSeeks");
    t.flush();
    expect(lastBody().sequence).toBe(first + 1);
  });

  it("keeps counters cumulative across flushes", () => {
    const t = createCollector();
    t.record("commandsSent");
    t.flush();
    t.record("commandsSent");
    t.flush();
    // A dropped flush must be recoverable from the next one, so counters
    // accumulate rather than reset.
    expect(lastBody().commandsSent).toBe(2);
  });

  it("buckets drift rather than sending raw positions", () => {
    const t = createCollector();
    t.recordDrift(0.4);
    t.recordDrift(2);
    t.recordDrift(42);
    t.flush();

    const body = lastBody();
    expect(body.driftLt1).toBe(1);
    expect(body.driftLt3).toBe(1);
    expect(body.driftGte10).toBe(1);
  });

  it("starts a fresh anonymous session on reconnect", () => {
    const t = createCollector();
    t.record("hardSeeks");
    t.flush();
    const before = lastBody();

    t.rotateSession();
    t.record("hardSeeks");
    t.flush();
    const after = lastBody();

    expect(after.sequence).toBe(1);
    expect(after.hardSeeks).toBe(1);
    expect(after.sessionId).not.toBe(before.sessionId);
  });

  it("ignores non-positive and non-finite amounts", () => {
    const t = createCollector();
    t.record("hardSeeks", 0);
    t.record("hardSeeks", -5);
    t.record("hardSeeks", 0.5);
    t.recordDrift(Number.NaN);
    t.flush();
    expect(sendPayload).not.toHaveBeenCalled();
  });

  it("floors and caps counters on the client", () => {
    const t = createCollector();
    t.record("hardSeeks", 3.9);
    t.record("commandsSent", 200_000);
    t.flush();
    expect(lastBody().hardSeeks).toBe(3);
    expect(lastBody().commandsSent).toBe(100_000);
  });

  it("keeps the snapshot for the next flush when the request fails", async () => {
    let offline = true;
    sendPayload = vi.fn(() =>
      offline ? Promise.reject(new Error("offline")) : Promise.resolve(),
    );
    const t = createCollector();
    t.record("hardSeeks");
    t.flush();
    await Promise.resolve();

    offline = false;
    t.flush();
    expect(lastBody().hardSeeks).toBe(1);
  });

  it("does not dirty a new session when an old request fails late", async () => {
    let rejectOld!: (error: Error) => void;
    sendPayload = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectOld = reject;
        }),
    );
    const t = createCollector();
    t.record("hardSeeks");
    t.flush();
    t.rotateSession();

    rejectOld(new Error("late offline"));
    await Promise.resolve();

    const callsBefore = sendPayload.mock.calls.length;
    t.flush();
    expect(sendPayload).toHaveBeenCalledTimes(callsBefore);
  });
});
