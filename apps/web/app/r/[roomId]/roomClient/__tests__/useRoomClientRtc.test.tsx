import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  closeAllPeers: vi.fn(),
  renegotiateAllPeers: vi.fn().mockResolvedValue(undefined),
  broadcastCurrentMediaState: vi.fn(),
  broadcastCurrentSpeakingState: vi.fn(),
}));

vi.mock("../../hooks", () => ({
  useMediaDevices: () => ({
    audioInputId: "",
    videoInputId: "",
    refreshAfterAccess: vi.fn(),
  }),
  useMediaTracks: () => ({
    ensureLocalStream: vi.fn(() => null),
    broadcastCurrentMediaState: mocks.broadcastCurrentMediaState,
    broadcastCurrentSpeakingState: mocks.broadcastCurrentSpeakingState,
    disableScreen: vi.fn(),
    disableCam: vi.fn(),
    disableMic: vi.fn(),
  }),
  useWebRTCPeers: () => ({
    closeAllPeers: mocks.closeAllPeers,
    renegotiateAllPeers: mocks.renegotiateAllPeers,
    peerConnectionStates: {},
    retryFailedPeers: vi.fn(),
  }),
}));

import { useRoomClientRtc } from "../useRoomClientRtc";

describe("useRoomClientRtc signaling epochs", () => {
  it("rebuilds peers on reconnect and repeats media after join is accepted", () => {
    let roomUsersListener:
      | ((data: { roomId: string; users: string[] }) => void)
      | undefined;
    const onRoomUsers = vi.fn((listener) => {
      roomUsersListener = listener;
      return vi.fn();
    });
    const baseRoom = {
      onRoomUsers,
      sendWebRTCIce: vi.fn(),
      sendWebRTCOffer: vi.fn(),
      sendWebRTCAnswer: vi.fn(),
      onUserJoined: undefined,
      onUserLeft: undefined,
      onWebRTCOffer: undefined,
      onWebRTCAnswer: undefined,
      onWebRTCIce: undefined,
      onWebRTCMediaState: undefined,
      onWebRTCSpeaking: undefined,
      sendWebRTCMediaState: vi.fn(),
      sendWebRTCSpeaking: vi.fn(),
    };

    const { rerender, unmount } = renderHook(
      ({ isConnected }) =>
        useRoomClientRtc({
          roomId: "room",
          userId: "self",
          isClient: true,
          room: { ...baseRoom, isConnected } as never,
          echoCancellationEnabled: true,
          noiseSuppressionEnabled: true,
          autoGainControlEnabled: true,
          pushToTalkEnabled: false,
          pushToTalkDownRef: { current: false },
        }),
      { initialProps: { isConnected: false } },
    );

    expect(mocks.closeAllPeers).toHaveBeenCalledOnce();
    rerender({ isConnected: true });
    expect(mocks.renegotiateAllPeers).toHaveBeenCalledOnce();

    act(() => {
      roomUsersListener?.({ roomId: "room", users: ["self", "peer"] });
    });
    expect(mocks.broadcastCurrentMediaState).toHaveBeenCalledOnce();
    expect(mocks.broadcastCurrentSpeakingState).toHaveBeenCalledOnce();

    rerender({ isConnected: false });
    expect(mocks.closeAllPeers).toHaveBeenCalledTimes(2);
    unmount();
  });
});
