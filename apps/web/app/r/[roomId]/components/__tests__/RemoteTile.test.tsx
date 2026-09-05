import React from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RemoteTile } from "../RemoteTile";

function createStream() {
  const audio = { kind: "audio", readyState: "live", muted: false };
  const video = { kind: "video", readyState: "live", muted: false };
  return {
    getTracks: () => [audio, video],
    getAudioTracks: () => [audio],
    getVideoTracks: () => [video],
  } as unknown as MediaStream;
}

describe("RemoteTile", () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hides a frozen receiver frame when ordered media state says camera is off", () => {
    const stream = createStream();
    const { container, rerender } = render(
      <RemoteTile
        id="peer"
        stream={stream}
        speaking={false}
        label="Peer"
        media={{ mic: true, cam: true, screen: false }}
      />,
    );

    const video = container.querySelector("video");
    expect(screen.queryByText("Video off")).toBeNull();
    expect(video?.className).not.toContain("opacity-0");

    rerender(
      <RemoteTile
        id="peer"
        stream={stream}
        speaking={false}
        label="Peer"
        media={{ mic: false, cam: false, screen: false }}
      />,
    );

    expect(screen.getByText("Video off")).toBeTruthy();
    expect(screen.getByText("Mic off")).toBeTruthy();
    expect(video?.className).toContain("opacity-0");
    expect(video?.getAttribute("aria-hidden")).toBe("true");
  });

  it("keeps screen sharing visible while the camera state is off", () => {
    render(
      <RemoteTile
        id="peer"
        stream={createStream()}
        speaking={false}
        label="Peer"
        media={{ mic: true, cam: false, screen: true }}
      />,
    );

    expect(screen.queryByText("Video off")).toBeNull();
  });
});
