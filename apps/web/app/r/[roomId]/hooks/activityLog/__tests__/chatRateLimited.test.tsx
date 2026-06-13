import { act, renderHook } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

import type { LogEntry } from "../../../types";
import type { UseActivityLogProps } from "../types";
import { useActivityLogSubscriptions } from "../useActivityLogSubscriptions";

// Focused test for the chat_rate_limited surfacing fix.
//
// The server emits "chat_rate_limited" to the single socket whose message was
// dropped for being too fast. useActivityLogSubscriptions must subscribe via
// room.onChatRateLimited and append a transient SYSTEM notice to the log so the
// dropped message isn't silent — and clean the subscription up on teardown.
//
// We don't mount the whole activity tree; we drive the subscriptions hook
// directly with a tiny fake socket-callback registry so we can fire the event
// and inspect the resulting log entries.

const ROOM_ID = "test-room";

function setup() {
  let logs: LogEntry[] = [];
  const setLogs = vi.fn((updater: unknown) => {
    logs =
      typeof updater === "function"
        ? (updater as (prev: LogEntry[]) => LogEntry[])(logs)
        : (updater as LogEntry[]);
  });

  // Capture the callback registered with onChatRateLimited and whether its
  // unsubscribe was invoked.
  let fired: ((data: { roomId: string }) => void) | null = null;
  const unsubscribe = vi.fn();
  const onChatRateLimited = vi.fn(
    (cb: (data: { roomId: string }) => void) => {
      fired = cb;
      return unsubscribe;
    },
  );

  // onSyncEvent is invoked unconditionally by the hook and must return a
  // cleanup; everything else the hook reads on the rate-limit path is
  // optional, so a minimal cast keeps the harness small.
  const props = {
    roomId: ROOM_ID,
    userId: "user-1",
    socketId: "socket-1",
    isConnected: true,
    playerRef: { current: null },
    applyingRemoteSyncRef: { current: false },
    onSyncEvent: () => () => {},
    onChatRateLimited,
    setPlayerReady: () => {},
    setPlayerError: () => {},
    setLogs,
  } as unknown as UseActivityLogProps & {
    setLogs: React.Dispatch<React.SetStateAction<LogEntry[]>>;
  };

  const harness = renderHook(() => useActivityLogSubscriptions(props));

  return {
    harness,
    getLogs: () => logs,
    fire: (roomId: string) => fired?.({ roomId }),
    unsubscribe,
  };
}

describe("useActivityLogSubscriptions: chat_rate_limited", () => {
  it("appends a SYSTEM notice when rate-limited for this room", () => {
    const { getLogs, fire } = setup();

    act(() => {
      fire(ROOM_ID);
    });

    const logs = getLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      type: "notice",
      user: "System",
      msg: "You're sending messages too quickly — wait a moment.",
    });
    expect(logs[0]!.id).toBeTruthy();
  });

  it("ignores events for a different room", () => {
    const { getLogs, fire } = setup();

    act(() => {
      fire("some-other-room");
    });

    expect(getLogs()).toHaveLength(0);
  });

  it("unsubscribes on teardown", () => {
    const { harness, unsubscribe } = setup();

    harness.unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
