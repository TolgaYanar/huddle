import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createInitialState } from "../state";

const platformMocks = vi.hoisted(() => ({
  getBestVideo: vi.fn(),
  getContentIdFromUrl: vi.fn<(url: string) => string | null>(() => "200"),
  getCurrentContentId: vi.fn<() => string | null>(() => "100"),
  isPlaybackUrl: vi.fn(() => true),
  seek: vi.fn(),
  play: vi.fn(),
  requiresVerifiedContentIdentity: false,
}));

vi.mock("../video", () => ({
  computeDesiredTimestampNow: vi.fn(() => null),
}));

vi.mock("../platforms", () => ({
  getActivePlatformAdapter: () => ({
    id: "netflix",
    displayName: "Netflix",
    getPlayer: platformMocks.getBestVideo,
    getContentIdFromUrl: platformMocks.getContentIdFromUrl,
    getCurrentContentId: platformMocks.getCurrentContentId,
    isPlaybackUrl: platformMocks.isPlaybackUrl,
    formatContentId: (id: string) => `/watch/${id}`,
    getNavigationUrl: (url: string) => url,
    requiresVerifiedContentIdentity:
      platformMocks.requiresVerifiedContentIdentity,
    seek: platformMocks.seek,
    play: platformMocks.play,
    getMetadata: vi.fn(),
    subscribeToPotentialContentChanges: vi.fn(),
  }),
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
    platformMocks.requiresVerifiedContentIdentity = false;
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

    platformMocks.getBestVideo.mockReturnValue(null);
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

    platformMocks.getBestVideo.mockReturnValue(fakeVideo());
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
    platformMocks.getBestVideo.mockReturnValue(fakeVideo());
    platformMocks.getContentIdFromUrl.mockReturnValue("100");
    platformMocks.getCurrentContentId.mockReturnValue("100");

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
    platformMocks.getBestVideo.mockReturnValue(fakeVideo());
    platformMocks.getContentIdFromUrl.mockReturnValue("200");
    platformMocks.getCurrentContentId.mockReturnValue("100");

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

  it("fails closed when a platform requires a live identity that is unavailable", () => {
    const state = createInitialState();
    state.hasUserGesture = true;
    platformMocks.requiresVerifiedContentIdentity = true;
    platformMocks.getBestVideo.mockReturnValue(fakeVideo());
    platformMocks.getContentIdFromUrl.mockReturnValue(null);
    platformMocks.getCurrentContentId.mockReturnValue(null);

    const updateOverlay = vi.fn();
    applyRoomStateToVideo(
      state,
      {
        roomId: "room",
        videoUrl: "https://www.primevideo.com/detail/stale",
        isPlaying: true,
      },
      { updateOverlay },
      { source: "room_state" },
    );

    expect(platformMocks.play).not.toHaveBeenCalled();
    expect(state.lastCatchUpNote).toContain("identity is unavailable");
    expect(updateOverlay).toHaveBeenCalledOnce();
  });

  it("seeds an empty room from a verified Prime title", () => {
    const state = createInitialState();
    const emit = vi.fn();
    state.socket = { connected: true, emit } as never;
    state.currentRoomId = "room";
    platformMocks.requiresVerifiedContentIdentity = true;
    platformMocks.getBestVideo.mockReturnValue(fakeVideo());
    platformMocks.getCurrentContentId.mockReturnValue("prime:s1:e2:abc");
    vi.stubGlobal("location", {
      href: "https://www.primevideo.com/detail/STALE",
      pathname: "/detail/STALE",
    });

    applyRoomStateToVideo(
      state,
      { roomId: "room", isPlaying: false },
      { updateOverlay: vi.fn() },
      { source: "room_state" },
    );

    expect(emit).toHaveBeenCalledWith("sync_video", {
      roomId: "room",
      action: "change_url",
      timestamp: 0,
      videoUrl: "https://www.primevideo.com/detail/STALE",
      contentId: "prime:s1:e2:abc",
    });
    expect(state.hasAppliedRoomStateSinceConnect).toBe(true);
  });
});
