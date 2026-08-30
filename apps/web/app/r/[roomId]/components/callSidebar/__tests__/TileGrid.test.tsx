import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TileGrid } from "../TileGrid";

afterEach(() => vi.restoreAllMocks());

function fakeStream(): MediaStream {
  return {
    getVideoTracks: () => [],
    getAudioTracks: () => [],
  } as unknown as MediaStream;
}

describe("TileGrid non-pointer pinning", () => {
  it("pins local and remote video without drag-and-drop", async () => {
    const user = userEvent.setup();
    const onPinTile = vi.fn();
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();

    render(
      <TileGrid
        userId="local-user"
        hostId={null}
        isHost={false}
        localSpeaking={false}
        camEnabled
        screenEnabled={false}
        localVideoRef={React.createRef<HTMLVideoElement>()}
        setLocalVideoElement={vi.fn()}
        remoteStreams={[{ id: "remote-user", stream: fakeStream() }]}
        remoteSpeaking={{}}
        remoteMedia={{}}
        onKickUser={vi.fn()}
        getDisplayName={() => "Alice"}
        setIsDraggingTile={vi.fn()}
        setIsStageDragOver={vi.fn()}
        onPinTile={onPinTile}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Pin your video to the main player",
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "Pin Alice to the main player",
      }),
    );

    expect(onPinTile).toHaveBeenNthCalledWith(1, { kind: "local" });
    expect(onPinTile).toHaveBeenNthCalledWith(2, {
      kind: "remote",
      peerId: "remote-user",
    });
  });
});
