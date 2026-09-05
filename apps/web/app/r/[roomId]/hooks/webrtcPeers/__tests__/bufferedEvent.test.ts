import { describe, expect, it, vi } from "vitest";

import { createBufferedEventChannel } from "shared-logic";

describe("createBufferedEventChannel", () => {
  it("replays signaling that arrived before the React consumer subscribed", () => {
    const channel = createBufferedEventChannel<string>();
    const listener = vi.fn();

    channel.publish("offer");
    channel.publish("ice");
    expect(channel.pendingCount()).toBe(2);

    const unsubscribe = channel.subscribe(listener);

    expect(listener.mock.calls).toEqual([["offer"], ["ice"]]);
    expect(channel.pendingCount()).toBe(0);

    channel.publish("answer");
    expect(listener).toHaveBeenLastCalledWith("answer");
    unsubscribe();
  });

  it("bounds pre-subscription signaling and clears it across reconnects", () => {
    const channel = createBufferedEventChannel<number>(2);
    const listener = vi.fn();

    channel.publish(1);
    channel.publish(2);
    channel.publish(3);
    expect(channel.pendingCount()).toBe(2);

    channel.clear();
    channel.subscribe(listener);
    expect(listener).not.toHaveBeenCalled();
  });

  it("detaches callbacks carrying an old socket id on reconnect", () => {
    const channel = createBufferedEventChannel<string>();
    const oldSocketListener = vi.fn();
    const newSocketListener = vi.fn();
    channel.subscribe(oldSocketListener);

    channel.reset();
    channel.publish("new-socket-offer");

    expect(oldSocketListener).not.toHaveBeenCalled();
    channel.subscribe(newSocketListener);
    expect(newSocketListener).toHaveBeenCalledWith("new-socket-offer");
  });
});
