import React from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RemoteAudioSink } from "../RemoteAudioSink";
import { RemoteTile } from "../RemoteTile";

// jsdom has no MediaStream. The sink only needs an object it can hand to
// srcObject and subscribe to for "addtrack", so a plain stub is enough and
// keeps the test about the sink rather than about the platform.
function fakeStream(audioTracks = 1): MediaStream {
  const listeners = new Map<string, Set<() => void>>();
  return {
    getAudioTracks: () => Array.from({ length: audioTracks }, () => ({})),
    getVideoTracks: () => [],
    getTracks: () => [],
    addEventListener: (type: string, fn: () => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener: (type: string, fn: () => void) => {
      listeners.get(type)?.delete(fn);
    },
    dispatch: (type: string) => listeners.get(type)?.forEach((fn) => fn()),
  } as unknown as MediaStream;
}

const notAllowed = () => {
  const err = new Error("play() failed because the user didn't interact");
  err.name = "NotAllowedError";
  return err;
};

describe("RemoteAudioSink", () => {
  let play: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    play = vi.fn(() => Promise.resolve());
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: play,
    });
    // jsdom does not implement srcObject; make it a plain settable property.
    Object.defineProperty(HTMLMediaElement.prototype, "srcObject", {
      configurable: true,
      writable: true,
      value: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("plays one element per remote stream and drops it when the stream goes", () => {
    const a = fakeStream();
    const b = fakeStream();
    const { rerender, container } = render(
      <RemoteAudioSink
        streams={[
          { id: "a", stream: a },
          { id: "b", stream: b },
        ]}
      />,
    );
    expect(container.querySelectorAll("audio")).toHaveLength(2);
    expect(play).toHaveBeenCalledTimes(2);

    rerender(<RemoteAudioSink streams={[{ id: "a", stream: a }]} />);
    expect(container.querySelectorAll("audio")).toHaveLength(1);
    expect(container.querySelector('[data-remote-audio="a"]')).not.toBeNull();
  });

  it("shows a control when the browser blocks playback, and clears it once the gesture unlocks audio", async () => {
    // First attempt is refused: the listener has not touched the page yet.
    play.mockRejectedValueOnce(notAllowed());
    render(<RemoteAudioSink streams={[{ id: "a", stream: fakeStream() }]} />);

    const button = await screen.findByRole("button", { name: "Enable audio" });
    expect(button).toBeTruthy();

    // The button click is itself a user gesture, so play() now succeeds.
    await userEvent.click(button);

    expect(play.mock.calls.length).toBeGreaterThanOrEqual(2);
    await act(async () => {});
    expect(screen.queryByRole("button", { name: "Enable audio" })).toBeNull();
  });

  it("does not raise the control for failures that are not the autoplay gate", async () => {
    const abort = new Error("interrupted by a new load request");
    abort.name = "AbortError";
    play.mockRejectedValueOnce(abort);
    render(<RemoteAudioSink streams={[{ id: "a", stream: fakeStream() }]} />);
    await act(async () => {});
    expect(screen.queryByRole("button", { name: "Enable audio" })).toBeNull();
  });

  it("asks the element to play again when the stream gains a track later", async () => {
    const stream = fakeStream(0);
    render(<RemoteAudioSink streams={[{ id: "a", stream }]} />);
    const before = play.mock.calls.length;
    act(() => {
      (stream as unknown as { dispatch: (t: string) => void }).dispatch(
        "addtrack",
      );
    });
    await act(async () => {});
    expect(play.mock.calls.length).toBe(before + 1);
  });

  it("shows nothing at all when there is nobody to hear", () => {
    const { container } = render(<RemoteAudioSink streams={[]} />);
    expect(container.querySelectorAll("audio")).toHaveLength(0);
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("RemoteTile", () => {
  it("no longer plays audio itself — that would double every voice and stop when the tile unmounts", () => {
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: vi.fn(() => Promise.resolve()),
    });
    Object.defineProperty(HTMLMediaElement.prototype, "srcObject", {
      configurable: true,
      writable: true,
      value: null,
    });
    const { container } = render(
      <RemoteTile id="p1" stream={fakeStream()} speaking={false} label="Ada" />,
    );
    expect(container.querySelector("audio")).toBeNull();
    expect(container.querySelector("video")).not.toBeNull();
  });
});
