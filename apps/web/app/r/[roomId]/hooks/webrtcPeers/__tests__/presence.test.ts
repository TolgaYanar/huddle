import { describe, expect, it, vi } from "vitest";

import { reconcileRoomUsers } from "../presence";

describe("reconcileRoomUsers", () => {
  it("closes peers absent from the authoritative snapshot and prunes state", () => {
    const closePeer = vi.fn();
    const clearPendingIce = vi.fn();
    let media: Record<string, string> = { active: "on", ghost: "on" };
    let speaking: Record<string, boolean> = { active: true, ghost: true };

    const active = reconcileRoomUsers({
      users: ["self", "active"],
      currentUserId: "self",
      peerIds: ["active", "ghost"],
      mediaStates: { active: "fresh" },
      closePeer,
      clearPendingIce,
      setRemoteMedia: (update) => {
        media = typeof update === "function" ? update(media) : update;
      },
      setRemoteSpeaking: (update) => {
        speaking = typeof update === "function" ? update(speaking) : update;
      },
    });

    expect([...active]).toEqual(["active"]);
    expect(closePeer).toHaveBeenCalledWith("ghost");
    expect(clearPendingIce).toHaveBeenCalledWith("ghost");
    expect(media).toEqual({ active: "fresh" });
    expect(speaking).toEqual({ active: true });
  });
});
