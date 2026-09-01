import { act, renderHook } from "@testing-library/react";
import React, { type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SyncTelemetryProvider, useSyncTelemetry } from "../useSyncTelemetry";

function wrapper({ children }: { children: ReactNode }) {
  return <SyncTelemetryProvider>{children}</SyncTelemetryProvider>;
}

describe("useSyncTelemetry", () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(null, { status: 202 }));
  const sendBeaconMock = vi.fn().mockReturnValue(true);

  beforeEach(() => {
    fetchMock.mockClear();
    sendBeaconMock.mockClear();
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      value: sendBeaconMock,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("flushes bounded cumulative counters with a monotonic sequence", () => {
    const { result, unmount } = renderHook(() => useSyncTelemetry(), {
      wrapper,
    });

    act(() => {
      result.current.setPlatform("youtube");
      result.current.record("commandsSent", 2);
      result.current.recordDrift(3.5);
      result.current.flush();
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const first = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit).body),
    );
    expect(first).toMatchObject({
      sequence: 1,
      source: "web",
      platform: "youtube",
      commandsSent: 2,
      driftLt5: 1,
    });

    act(() => {
      result.current.record("commandsSent");
      result.current.flush();
    });
    const second = JSON.parse(
      String((fetchMock.mock.calls[1]?.[1] as RequestInit).body),
    );
    expect(second.sequence).toBe(2);
    expect(second.sessionId).toBe(first.sessionId);
    expect(second.commandsSent).toBe(3);
    expect(second.driftLt5).toBe(1);
    unmount();
  });

  it("rotates the anonymous session when the platform changes", () => {
    const { result, unmount } = renderHook(() => useSyncTelemetry(), {
      wrapper,
    });

    act(() => {
      result.current.record("joinAttempts");
      result.current.setPlatform("unknown");
      result.current.setPlatform("youtube");
      result.current.flush();
    });
    const youtube = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit).body),
    );
    expect(youtube.platform).toBe("youtube");
    expect(youtube.joinAttempts).toBe(1);

    act(() => {
      result.current.setPlatform("netflix");
      result.current.record("playerFound");
      result.current.flush();
    });
    const netflix = JSON.parse(
      String((fetchMock.mock.calls[1]?.[1] as RequestInit).body),
    );
    expect(netflix.platform).toBe("netflix");
    expect(netflix.sessionId).not.toBe(youtube.sessionId);
    expect(netflix.sequence).toBe(1);
    expect(netflix.joinAttempts).toBe(0);
    unmount();
  });

  it("uses sendBeacon on pagehide without attaching product identifiers", async () => {
    const { result, unmount } = renderHook(() => useSyncTelemetry(), {
      wrapper,
    });

    act(() => {
      result.current.setPlatform("youtube");
      result.current.record("hardSeeks");
      window.dispatchEvent(new Event("pagehide"));
    });

    expect(sendBeaconMock).toHaveBeenCalledOnce();
    const blob = sendBeaconMock.mock.calls[0]?.[1] as Blob;
    expect(blob.type).toBe("application/json");
    const payload = JSON.parse(await blob.text());
    expect(payload).toMatchObject({ source: "web", platform: "youtube" });
    expect(Object.keys(payload)).not.toContain("roomId");
    expect(Object.keys(payload)).not.toContain("userId");
    expect(Object.keys(payload)).not.toContain("url");
    unmount();
  });
});
