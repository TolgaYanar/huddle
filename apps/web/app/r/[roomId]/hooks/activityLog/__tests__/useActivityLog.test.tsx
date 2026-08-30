import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MAX_LOG_ENTRIES, useActivityLog } from "../useActivityLog";
import type { UseActivityLogProps } from "../types";

function makeProps(
  sendChatMessage?: (text: string) => void,
): UseActivityLogProps {
  return {
    roomId: "room-1",
    userId: "user-1",
    socketId: "socket-1",
    isConnected: false,
    playerRef: { current: null },
    applyingRemoteSyncRef: { current: false },
    setUrl: vi.fn(),
    setInputUrl: vi.fn(),
    setVideoState: vi.fn(),
    setMuted: vi.fn(),
    setVolume: vi.fn(),
    setPlaybackRate: vi.fn(),
    setAudioSyncEnabled: vi.fn(),
    setPlayerReady: vi.fn(),
    setPlayerError: vi.fn(),
    onSyncEvent: () => () => {},
    sendChatMessage,
  };
}

describe("useActivityLog chat sender", () => {
  it("trims and sends text without owning draft state", () => {
    const sendChatMessage = vi.fn();
    const { result } = renderHook(() =>
      useActivityLog(makeProps(sendChatMessage)),
    );

    expect(result.current.sendChat("  hello room  ")).toBe(true);
    expect(sendChatMessage).toHaveBeenCalledWith("hello room");
    expect(result.current).not.toHaveProperty("chatText");
  });

  it("keeps the draft when text cannot be sent", () => {
    const { result } = renderHook(() => useActivityLog(makeProps()));

    expect(result.current.sendChat("hello")).toBe(false);
    expect(result.current.sendChat("   ")).toBe(false);
  });
});

describe("activity log retention", () => {
  it("caps retained entries and keeps the newest ones", () => {
    const { result } = renderHook(() => useActivityLog(makeProps()));

    act(() => {
      for (let i = 0; i < MAX_LOG_ENTRIES + 50; i++) {
        result.current.addLogEntry({
          msg: `entry-${i}`,
          type: "info",
          user: "System",
        });
      }
    });

    expect(result.current.logs).toHaveLength(MAX_LOG_ENTRIES);
    expect(result.current.logs[0]?.msg).toBe("entry-50");
    expect(result.current.logs.at(-1)?.msg).toBe(
      `entry-${MAX_LOG_ENTRIES + 49}`,
    );
  });

  it("leaves a log under the cap untouched", () => {
    const { result } = renderHook(() => useActivityLog(makeProps()));

    act(() => {
      result.current.addLogEntry({ msg: "only", type: "info", user: "System" });
    });

    expect(result.current.logs).toHaveLength(1);
    expect(result.current.logs[0]?.msg).toBe("only");
  });
});
