import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useStagePinning } from "../useStagePinning";

function fakeStream(hasVideo = true): MediaStream {
  return {
    getVideoTracks: () =>
      hasVideo
        ? ([{ readyState: "live", muted: false }] as MediaStreamTrack[])
        : [],
  } as unknown as MediaStream;
}

describe("useStagePinning", () => {
  it("unpins a remote frozen receiver track when authoritative video state turns off", async () => {
    const stream = fakeStream(true);
    const { result, rerender } = renderHook(
      ({ cam }) =>
        useStagePinning({
          userId: "local",
          ensureLocalStream: vi.fn(() => fakeStream(true)),
          localVideoActive: true,
          remoteStreams: [{ id: "remote", stream }],
          remoteMedia: {
            remote: { mic: true, cam, screen: false },
          },
        }),
      { initialProps: { cam: true } },
    );

    act(() => {
      result.current.setPinnedStage({ kind: "remote", peerId: "remote" });
    });
    expect(result.current.stageView?.id).toBe("remote");

    rerender({ cam: false });
    await waitFor(() => expect(result.current.pinnedStage).toBeNull());
    expect(result.current.stageView).toBeNull();
  });

  it("unpins local video when both camera and screen sharing stop", async () => {
    const stream = fakeStream(true);
    const ensureLocalStream = vi.fn(() => stream);
    const { result, rerender } = renderHook(
      ({ active }) =>
        useStagePinning({
          userId: "local",
          ensureLocalStream,
          localVideoActive: active,
          remoteStreams: [],
          remoteMedia: {},
        }),
      { initialProps: { active: true } },
    );

    act(() => result.current.setPinnedStage({ kind: "local" }));
    expect(result.current.stageView?.isLocal).toBe(true);

    rerender({ active: false });
    await waitFor(() => expect(result.current.pinnedStage).toBeNull());
    expect(result.current.stageView).toBeNull();
  });
});
