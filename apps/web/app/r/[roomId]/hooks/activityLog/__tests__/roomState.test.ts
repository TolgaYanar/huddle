import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RoomStateData } from "shared-logic";

import { applyRoomState } from "../roomState";

function setup(currentTime = 0) {
  const player = {
    getCurrentTime: vi.fn(() => currentTime),
    seekTo: vi.fn(),
  };
  const args = {
    roomId: "room",
    socketId: "me",
    playerRef: { current: player },
    lastAppliedRoomRevRef: { current: 0 },
    markApplyingRemoteSync: vi.fn(),
    setRoomPlaybackAnchor: vi.fn(),
    setUrl: vi.fn(),
    setInputUrl: vi.fn(),
    setVideoState: vi.fn(),
    setMuted: vi.fn(),
    setVolume: vi.fn(),
    setPlaybackRate: vi.fn(),
    setAudioSyncEnabled: vi.fn(),
    lastUserPauseAtRef: { current: 0 },
  };
  const apply = (state: Partial<RoomStateData>) =>
    applyRoomState({
      ...args,
      state: { roomId: "room", ...state } as RoomStateData,
    });
  return { player, args, apply };
}

describe("applyRoomState", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("ignores state for another room", () => {
    const { args } = setup();
    applyRoomState({
      ...args,
      state: { roomId: "other", isPlaying: true } as RoomStateData,
    });
    expect(args.setVideoState).not.toHaveBeenCalled();
    expect(args.markApplyingRemoteSync).not.toHaveBeenCalled();
  });

  it("only ever advances the applied revision", () => {
    const { args, apply } = setup();
    apply({ rev: 5 });
    apply({ rev: 3 });
    expect(args.lastAppliedRoomRevRef.current).toBe(5);
  });

  it("seeks when drift exceeds 2 s and leaves small drift alone", () => {
    const { player, apply } = setup(10);
    apply({ timestamp: 11.5, serverNow: 1_000_000 });
    expect(player.seekTo).not.toHaveBeenCalled();
    apply({ timestamp: 13, serverNow: 1_000_000 });
    expect(player.seekTo).toHaveBeenCalledWith(13, "seconds");
  });

  it("tolerates up to 7 s of drift on the echo of our own broadcast", () => {
    const { player, apply } = setup(10);
    apply({ timestamp: 15, serverNow: 1_000_000, senderId: "me" });
    expect(player.seekTo).not.toHaveBeenCalled();
    apply({ timestamp: 18, serverNow: 1_000_000, senderId: "me" });
    expect(player.seekTo).toHaveBeenCalledWith(18, "seconds");
  });

  it("extrapolates a playing state the server did not extrapolate", () => {
    const { player, apply } = setup(0);
    // Updated 10 s ago at 1.5x: the live position is 20 + 15.
    apply({
      timestamp: 20,
      isPlaying: true,
      playbackSpeed: 1.5,
      updatedAt: 1_000_000 - 10_000,
    });
    expect(player.seekTo).toHaveBeenCalledWith(35, "seconds");
  });

  it("does not resume playback right after the user paused", () => {
    const { args, apply } = setup();
    args.lastUserPauseAtRef.current = 1_000_000 - 1_000;
    apply({ isPlaying: true });
    expect(args.setVideoState).not.toHaveBeenCalled();
    apply({ isPlaying: false });
    expect(args.setVideoState).toHaveBeenCalledWith("Paused");
  });

  it("keeps playback muted until the user has interacted", () => {
    const { args, apply } = setup();
    vi.stubGlobal("navigator", { userActivation: { hasBeenActive: false } });
    apply({ isMuted: false });
    expect(args.setMuted).toHaveBeenLastCalledWith(true);

    vi.stubGlobal("navigator", { userActivation: { hasBeenActive: true } });
    apply({ isMuted: false });
    expect(args.setMuted).toHaveBeenLastCalledWith(false);
  });

  it("clamps volume to 0..1", () => {
    const { args, apply } = setup();
    apply({ volume: 4 });
    expect(args.setVolume).toHaveBeenLastCalledWith(1);
    apply({ volume: -1 });
    expect(args.setVolume).toHaveBeenLastCalledWith(0);
  });
});
