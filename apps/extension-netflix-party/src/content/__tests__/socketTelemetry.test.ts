import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createInitialState } from "../state";

const socketMock = vi.hoisted(() => {
  const handlers = new Map<string, (...args: any[]) => void>();
  const socket = {
    id: "socket-1",
    connected: true,
    on: vi.fn((event: string, handler: (...args: any[]) => void) => {
      handlers.set(event, handler);
      return socket;
    }),
    emit: vi.fn(),
    removeAllListeners: vi.fn(),
    disconnect: vi.fn(),
  };
  return { handlers, socket };
});

vi.mock("socket.io-client", () => ({ io: () => socketMock.socket }));
vi.mock("../playerSync", () => ({
  applyRoomStateToVideo: vi.fn(),
  recordPendingRoomState: vi.fn(),
  roomUsesActivePlatform: vi.fn(() => true),
  shouldApplyFollow: vi.fn(() => false),
  startPlayPausePoll: vi.fn(),
  stopPlayPausePoll: vi.fn(),
}));

import { connect } from "../socket";

describe("socket telemetry lifecycle", () => {
  beforeEach(() => {
    socketMock.handlers.clear();
    vi.clearAllMocks();
    vi.stubGlobal("chrome", {
      storage: { local: { remove: vi.fn() } },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps pre-connect presence on the first session and re-states it after reconnect", () => {
    const state = createInitialState();
    const record = vi.fn();
    const rotateSession = vi.fn();
    state.telemetry = { record, rotateSession } as never;
    state.telemetryPlayerPresent = true;

    connect(
      state,
      { roomId: "room", serverUrl: "https://api.wehuddle.tv" },
      { ensureOverlay: vi.fn(), updateOverlay: vi.fn() },
    );

    socketMock.handlers.get("connect")?.();
    expect(rotateSession).not.toHaveBeenCalled();
    expect(record).toHaveBeenCalledWith("joinAttempts");

    socketMock.handlers.get("room_users")?.({ roomId: "room", users: [] });
    expect(record).toHaveBeenCalledWith("joinSuccess");

    record.mockClear();
    socketMock.handlers.get("connect")?.();
    expect(rotateSession).toHaveBeenCalledTimes(1);
    expect(record.mock.calls).toEqual([["playerFound"], ["joinAttempts"]]);
  });

  it("does not carry authoritative playback state into a manually selected room", () => {
    const state = createInitialState();
    state.currentRoomId = "old-room";
    state.lastKnownRoomVideoUrl =
      "https://www.primevideo.com/detail/OLD_EPISODE";
    state.pendingRoomState = {
      roomId: "old-room",
      videoUrl: "https://www.primevideo.com/detail/OLD_EPISODE",
      contentId: "prime:s1:e1:old",
    };
    state.hasAppliedRoomStateSinceConnect = true;
    state.lastContentIdMismatch = {
      expected: "prime:s1:e1:old",
      actual: "prime:s1:e2:old",
    };
    state.lastCatchUpNote = "Old room note";

    connect(
      state,
      { roomId: "new-room", serverUrl: "https://api.wehuddle.tv" },
      { ensureOverlay: vi.fn(), updateOverlay: vi.fn() },
    );

    expect(state.currentRoomId).toBe("new-room");
    expect(state.lastKnownRoomVideoUrl).toBeNull();
    expect(state.pendingRoomState).toBeNull();
    expect(state.hasAppliedRoomStateSinceConnect).toBe(false);
    expect(state.lastContentIdMismatch).toBeNull();
    expect(state.lastCatchUpNote).toBeNull();
  });
});
