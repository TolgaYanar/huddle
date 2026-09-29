import React from "react";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SoundCloudEmbed } from "../mediaRenderer/SoundCloudEmbed";

const Events = {
  READY: "ready",
  PLAY: "play",
  PAUSE: "pause",
  FINISH: "finish",
  PLAY_PROGRESS: "playProgress",
  SEEK: "seek",
  ERROR: "error",
};

function installFakeWidget() {
  const handlers = new Map<string, (data?: unknown) => void>();
  const widget = {
    bind: (event: string, cb: (data?: unknown) => void) => {
      handlers.set(event, cb);
    },
    unbind: (event: string) => {
      handlers.delete(event);
    },
    play: vi.fn(),
    pause: vi.fn(),
    seekTo: vi.fn(),
    setVolume: vi.fn(),
    getPosition: vi.fn(),
    getDuration: vi.fn(),
  };
  const factory = Object.assign(() => widget, { Events });
  (window as unknown as { SC: unknown }).SC = { Widget: factory };
  return { widget, fire: (event: string) => handlers.get(event)?.() };
}

function baseProps() {
  return {
    src: "https://w.soundcloud.com/player/?url=track",
    isPlaying: false,
    currentTime: 0,
    volume: 1,
    muted: false,
    applyingRemoteSyncRef: { current: false },
    onPlay: vi.fn(),
    onPause: vi.fn(),
    onProgress: vi.fn(),
    onDuration: vi.fn(),
    onReady: vi.fn(),
    onError: vi.fn(),
  };
}

describe("SoundCloudEmbed", () => {
  let fake: ReturnType<typeof installFakeWidget>;

  beforeEach(() => {
    fake = installFakeWidget();
  });

  afterEach(() => {
    delete (window as unknown as { SC?: unknown }).SC;
  });

  it("starts playback on READY when play arrived while the widget loaded", async () => {
    const props = baseProps();
    const { rerender } = render(<SoundCloudEmbed {...props} />);
    // Let ensureWidgetApi() resolve and the widget bind its handlers.
    await act(async () => {});

    // The room starts playing and the volume changes before READY.
    rerender(<SoundCloudEmbed {...props} isPlaying volume={0.4} />);
    expect(fake.widget.play).not.toHaveBeenCalled();

    act(() => fake.fire(Events.READY));

    expect(fake.widget.play).toHaveBeenCalledOnce();
    expect(fake.widget.setVolume).toHaveBeenLastCalledWith(40);
  });

  it("reports user plays through the latest onPlay callback", async () => {
    const props = baseProps();
    const { rerender } = render(<SoundCloudEmbed {...props} />);
    await act(async () => {});

    const nextOnPlay = vi.fn();
    rerender(<SoundCloudEmbed {...props} onPlay={nextOnPlay} />);
    act(() => fake.fire(Events.PLAY));

    expect(nextOnPlay).toHaveBeenCalledOnce();
    expect(props.onPlay).not.toHaveBeenCalled();
  });
});
