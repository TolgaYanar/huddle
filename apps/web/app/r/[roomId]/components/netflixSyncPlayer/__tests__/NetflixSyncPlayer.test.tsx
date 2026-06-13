import React from "react";
import { act, render } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// The leaf section components rely on the automatic JSX runtime (Next handles
// that at build time) and don't import React, so they can't render under this
// vitest setup, which compiles JSX to classic React.createElement. We mock them
// to trivial markers: this test exercises only the NetflixSyncPlayer imperative
// handle (the unit under test), and the handle is available via ref without
// opening the Netflix window — InitialPrompt renders while isWindowOpen is false.
vi.mock("../sections/InitialPrompt", () => ({
  InitialPrompt: () => React.createElement("div", { "data-testid": "initial" }),
}));
vi.mock("../sections/SyncingCountdown", () => ({
  SyncingCountdown: () => React.createElement("div"),
}));
vi.mock("../sections/SyncedControls", () => ({
  SyncedControls: () => React.createElement("div"),
}));
vi.mock("../sections/WaitingToSync", () => ({
  WaitingToSync: () => React.createElement("div"),
}));

import { NetflixSyncPlayer } from "../NetflixSyncPlayer";
import type { NetflixSyncPlayerRef } from "../types";

function renderPlayer(
  props?: Partial<React.ComponentProps<typeof NetflixSyncPlayer>>,
) {
  const ref = React.createRef<NetflixSyncPlayerRef>();
  const onPlay = vi.fn();
  const onPause = vi.fn();
  const onSeek = vi.fn();
  const onProgress = vi.fn();
  const onReady = vi.fn();
  const onError = vi.fn();
  const onDuration = vi.fn();

  render(
    <NetflixSyncPlayer
      ref={ref}
      url="https://www.netflix.com/watch/12345"
      isPlaying={false}
      currentTime={0}
      volume={1}
      muted={false}
      playbackRate={1}
      onPlay={onPlay}
      onPause={onPause}
      onSeek={onSeek}
      onProgress={onProgress}
      onReady={onReady}
      onError={onError}
      onDuration={onDuration}
      {...props}
    />,
  );

  return {
    ref,
    onPlay,
    onPause,
    onSeek,
    onProgress,
    onReady,
    onError,
    onDuration,
  };
}

describe("NetflixSyncPlayer imperative handle", () => {
  it("reflects seekTo() in getCurrentTime()", () => {
    const { ref } = renderPlayer();
    expect(ref.current).not.toBeNull();

    // seekTo schedules setLocalTime; flush so the re-rendered handle reads it.
    act(() => {
      ref.current!.seekTo(123);
    });
    expect(ref.current!.getCurrentTime()).toBe(123);
  });

  it("play()/pause() update local state without re-broadcasting (anti-echo)", () => {
    const { ref, onPlay, onPause } = renderPlayer();

    ref.current!.play();
    ref.current!.pause();

    // The remote-apply path drives the imperative handle; it must NOT call
    // onPlay/onPause or the client would echo a sync it is merely applying.
    expect(onPlay).not.toHaveBeenCalled();
    expect(onPause).not.toHaveBeenCalled();
  });

  it("exposes getDuration() and getCurrentTime() defaults before sync", () => {
    const { ref } = renderPlayer();
    expect(ref.current!.getDuration()).toBe(0);
    expect(ref.current!.getCurrentTime()).toBe(0);
  });
});
