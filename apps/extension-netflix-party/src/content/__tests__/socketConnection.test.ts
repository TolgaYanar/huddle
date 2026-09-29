import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createInitialState } from "../state";

const socketMock = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const socket = {
    id: "socket-1",
    connected: false,
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers.set(event, handler);
      return socket;
    }),
    emit: vi.fn(),
    removeAllListeners: vi.fn(),
    disconnect: vi.fn(),
  };
  const io = vi.fn(() => socket);
  return { handlers, socket, io };
});

vi.mock("socket.io-client", () => ({ io: socketMock.io }));
vi.mock("../playerSync", () => ({
  applyRoomStateToVideo: vi.fn(),
  recordPendingRoomState: vi.fn(),
  roomUsesActivePlatform: vi.fn(() => true),
  shouldApplyFollow: vi.fn(() => false),
  startPlayPausePoll: vi.fn(),
  stopPlayPausePoll: vi.fn(),
}));

import { connect, describeConnectError } from "../socket";

describe("extension socket connection", () => {
  beforeEach(() => {
    socketMock.handlers.clear();
    vi.clearAllMocks();
    vi.stubGlobal("chrome", { storage: { local: { remove: vi.fn() } } });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function connectOnce() {
    const state = createInitialState();
    const updateOverlay = vi.fn();
    connect(
      state,
      { roomId: "room", serverUrl: "https://api.wehuddle.tv" },
      { ensureOverlay: vi.fn(), updateOverlay },
    );
    return { state, updateOverlay };
  }

  it("connects over WebSocket only", () => {
    connectOnce();
    expect(socketMock.io).toHaveBeenCalledWith(
      "https://api.wehuddle.tv",
      expect.objectContaining({ transports: ["websocket"] }),
    );
  });

  it("shows an actionable message when the connection is blocked", () => {
    const { state, updateOverlay } = connectOnce();
    socketMock.handlers.get("connect_error")?.(new Error("websocket error"));
    expect(state.lastConnectionError).toMatch(/Can't reach the Huddle server/);
    expect(updateOverlay).toHaveBeenCalled();
  });
});

describe("describeConnectError", () => {
  it("translates transport failures", () => {
    for (const raw of ["websocket error", "timeout", "xhr poll error"]) {
      expect(describeConnectError(raw)).toMatch(/Can't reach/);
    }
  });

  it("passes server-sent reasons through", () => {
    expect(describeConnectError("unauthorized")).toBe("unauthorized");
  });
});
