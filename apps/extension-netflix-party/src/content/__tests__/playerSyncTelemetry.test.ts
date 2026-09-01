import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createInitialState } from "../state";

const videoMocks = vi.hoisted(() => ({
  getBestVideo: vi.fn(),
  getNetflixWatchIdFromUrl: vi.fn(() => "200"),
  getLocalWatchId: vi.fn(() => "100"),
}));

vi.mock("../video", () => ({
  getBestVideo: videoMocks.getBestVideo,
  computeDesiredTimestampNow: vi.fn(() => null),
  getNetflixWatchIdFromUrl: videoMocks.getNetflixWatchIdFromUrl,
  getLocalWatchId: videoMocks.getLocalWatchId,
  isNetflixWatchUrl: vi.fn(() => true),
}));

vi.mock("../netflixBackground", () => ({
  safeNetflixSeekViaBackground: vi.fn(),
  safeNetflixSetPlayingViaBackground: vi.fn(),
}));

import { applyRoomStateToVideo, attachVideoListeners } from "../playerSync";

function fakeVideo() {
  return {
    addEventListener: vi.fn(),
    currentTime: 10,
    duration: 100,
    paused: true,
    playbackRate: 1,
    readyState: 4,
  } as unknown as HTMLVideoElement;
}

describe("player sync telemetry", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      setTimeout: vi.fn(),
      location: { assign: vi.fn() },
    });
    vi.stubGlobal("location", {
      href: "https://www.netflix.com/watch/100",
      pathname: "/watch/100",
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("records player presence only when the video lifecycle changes", () => {
    const state = createInitialState();
    const record = vi.fn();
    state.telemetry = { record } as never;

    videoMocks.getBestVideo.mockReturnValue(null);
    expect(
      attachVideoListeners(state, {
        emitSync: vi.fn(),
        shouldEmitLocalSync: () => false,
      }),
    ).toBe(false);
    attachVideoListeners(state, {
      emitSync: vi.fn(),
      shouldEmitLocalSync: () => false,
    });

    videoMocks.getBestVideo.mockReturnValue(fakeVideo());
    attachVideoListeners(state, {
      emitSync: vi.fn(),
      shouldEmitLocalSync: () => false,
    });
    attachVideoListeners(state, {
      emitSync: vi.fn(),
      shouldEmitLocalSync: () => false,
    });

    expect(record.mock.calls).toEqual([["playerMissing"], ["playerFound"]]);
  });

  it("counts one autoplay block for duplicate snapshots", () => {
    const state = createInitialState();
    const record = vi.fn();
    state.telemetry = { record } as never;
    videoMocks.getBestVideo.mockReturnValue(fakeVideo());
    videoMocks.getNetflixWatchIdFromUrl.mockReturnValue("100");

    const roomState = {
      roomId: "room",
      videoUrl: "https://www.netflix.com/watch/100",
      isPlaying: true,
    };
    applyRoomStateToVideo(
      state,
      roomState,
      { updateOverlay: vi.fn() },
      {
        source: "room_state",
      },
    );
    applyRoomStateToVideo(
      state,
      roomState,
      { updateOverlay: vi.fn() },
      {
        source: "room_state",
      },
    );

    expect(
      record.mock.calls.filter(([counter]) => counter === "autoplayBlocked"),
    ).toHaveLength(1);
  });

  it("counts a mismatch once even when repeated before navigation", () => {
    const state = createInitialState();
    const record = vi.fn();
    state.telemetry = { record } as never;
    state.hasAppliedRoomStateSinceConnect = true;
    state.lastAutoNavigatedTo = "https://www.netflix.com/watch/200";
    state.lastAutoNavigatedAt = Date.now();
    videoMocks.getBestVideo.mockReturnValue(fakeVideo());
    videoMocks.getNetflixWatchIdFromUrl.mockReturnValue("200");

    const roomState = {
      roomId: "room",
      videoUrl: "https://www.netflix.com/watch/200",
    };
    applyRoomStateToVideo(state, roomState, { updateOverlay: vi.fn() });
    applyRoomStateToVideo(state, roomState, { updateOverlay: vi.fn() });

    expect(
      record.mock.calls.filter(([counter]) => counter === "contentMismatch"),
    ).toHaveLength(1);
  });
});
