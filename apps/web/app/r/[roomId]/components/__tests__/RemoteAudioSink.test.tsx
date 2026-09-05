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

  it("surfaces a non-autoplay playback failure and lets the listener retry", async () => {
    const unsupported = new Error("No supported source was found");
    unsupported.name = "NotSupportedError";
    play.mockRejectedValueOnce(unsupported);
    render(<RemoteAudioSink streams={[{ id: "a", stream: fakeStream() }]} />);

    const button = await screen.findByRole("button", { name: "Retry audio" });
    expect(
      screen.getByText(/sound permission and output device/i),
    ).toBeTruthy();

    await userEvent.click(button);
    await act(async () => {});
    expect(screen.queryByRole("button", { name: "Retry audio" })).toBeNull();
  });

  it("clears a playback warning when the affected participant leaves", async () => {
    const unsupported = new Error("Output device disappeared");
    unsupported.name = "NotReadableError";
    play.mockRejectedValueOnce(unsupported);
    const { rerender } = render(
      <RemoteAudioSink streams={[{ id: "a", stream: fakeStream() }]} />,
    );

    await screen.findByRole("button", { name: "Retry audio" });
    rerender(<RemoteAudioSink streams={[]} />);
    await act(async () => {});
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("clears a warning when a failed stream is replaced at the same list size", async () => {
    const unsupported = new Error("Output device disappeared");
    unsupported.name = "NotReadableError";
    play.mockRejectedValueOnce(unsupported);
    const { rerender } = render(
      <RemoteAudioSink streams={[{ id: "a", stream: fakeStream() }]} />,
    );

    await screen.findByRole("button", { name: "Retry audio" });
    rerender(<RemoteAudioSink streams={[{ id: "b", stream: fakeStream() }]} />);
    await act(async () => {});
    expect(screen.queryByRole("status")).toBeNull();
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

  it("routes every remote voice to the selected speaker before playback", async () => {
    const previous = Object.getOwnPropertyDescriptor(
      HTMLMediaElement.prototype,
      "setSinkId",
    );
    const setSinkId = vi.fn(() => Promise.resolve());
    Object.defineProperty(HTMLMediaElement.prototype, "setSinkId", {
      configurable: true,
      value: setSinkId,
    });

    try {
      const stream = fakeStream();
      const { rerender } = render(
        <RemoteAudioSink
          streams={[{ id: "a", stream }]}
          outputDeviceId="speaker-2"
        />,
      );
      await act(async () => {});
      expect(setSinkId).toHaveBeenCalledWith("speaker-2");
      expect(setSinkId.mock.invocationCallOrder[0]!).toBeLessThan(
        play.mock.invocationCallOrder[0]!,
      );

      rerender(
        <RemoteAudioSink
          streams={[{ id: "a", stream }]}
          outputDeviceId="speaker-3"
        />,
      );
      await act(async () => {});
      expect(setSinkId).toHaveBeenLastCalledWith("speaker-3");
    } finally {
      if (previous) {
        Object.defineProperty(
          HTMLMediaElement.prototype,
          "setSinkId",
          previous,
        );
      } else {
        Reflect.deleteProperty(HTMLMediaElement.prototype, "setSinkId");
      }
    }
  });

  it("re-applies the newest speaker when setSinkId resolves out of order", async () => {
    const previous = Object.getOwnPropertyDescriptor(
      HTMLMediaElement.prototype,
      "setSinkId",
    );
    let physicalSink = "";
    const requests: Array<{
      id: string;
      settle: () => void;
      promise: Promise<void>;
    }> = [];
    const setSinkId = vi.fn((id: string) => {
      let resolve!: () => void;
      const promise = new Promise<void>((done) => {
        resolve = done;
      });
      requests.push({
        id,
        promise,
        settle: () => {
          physicalSink = id;
          resolve();
        },
      });
      return promise;
    });
    Object.defineProperty(HTMLMediaElement.prototype, "setSinkId", {
      configurable: true,
      value: setSinkId,
    });

    try {
      const stream = fakeStream();
      const { rerender } = render(
        <RemoteAudioSink
          streams={[{ id: "a", stream }]}
          outputDeviceId="speaker-a"
        />,
      );
      expect(requests.map(({ id }) => id)).toEqual(["speaker-a"]);

      rerender(
        <RemoteAudioSink
          streams={[{ id: "a", stream }]}
          outputDeviceId="speaker-b"
        />,
      );
      expect(requests.map(({ id }) => id)).toEqual(["speaker-a", "speaker-b"]);

      // The newer request wins first, then the older request finishes late
      // and physically routes the element back to A.
      await act(async () => {
        requests[1]!.settle();
        await requests[1]!.promise;
      });
      expect(physicalSink).toBe("speaker-b");
      await act(async () => {
        requests[0]!.settle();
        await requests[0]!.promise;
      });
      expect(physicalSink).toBe("speaker-a");

      // The sink must notice the stale completion and enforce the current UI
      // selection again instead of silently leaving audio on speaker A.
      expect(requests.map(({ id }) => id)).toEqual([
        "speaker-a",
        "speaker-b",
        "speaker-b",
      ]);
      await act(async () => {
        requests[2]!.settle();
        await requests[2]!.promise;
      });
      expect(physicalSink).toBe("speaker-b");
      expect(setSinkId).toHaveBeenLastCalledWith("speaker-b");
    } finally {
      if (previous) {
        Object.defineProperty(
          HTMLMediaElement.prototype,
          "setSinkId",
          previous,
        );
      } else {
        Reflect.deleteProperty(HTMLMediaElement.prototype, "setSinkId");
      }
    }
  });

  it("reports when switching back to the system speaker fails", async () => {
    const previous = Object.getOwnPropertyDescriptor(
      HTMLMediaElement.prototype,
      "setSinkId",
    );
    const setSinkId = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("default output unavailable"));
    Object.defineProperty(HTMLMediaElement.prototype, "setSinkId", {
      configurable: true,
      value: setSinkId,
    });

    try {
      const stream = fakeStream();
      const { rerender } = render(
        <RemoteAudioSink
          streams={[{ id: "a", stream }]}
          outputDeviceId="speaker-2"
        />,
      );
      await act(async () => {});

      rerender(<RemoteAudioSink streams={[{ id: "a", stream }]} />);
      await screen.findByRole("button", { name: "Retry audio" });
      expect(
        screen.getByText(/switch back to the system default/i),
      ).toBeTruthy();
      expect(setSinkId).toHaveBeenLastCalledWith("");
    } finally {
      if (previous) {
        Object.defineProperty(
          HTMLMediaElement.prototype,
          "setSinkId",
          previous,
        );
      } else {
        Reflect.deleteProperty(HTMLMediaElement.prototype, "setSinkId");
      }
    }
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
