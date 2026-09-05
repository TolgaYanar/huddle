import { act, fireEvent, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { usePushToTalkBinding } from "../usePushToTalkBinding";
import { useKeyboardShortcuts } from "../useKeyboardShortcuts";

describe("usePushToTalkBinding", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("does not steal Space activation from an interactive control", () => {
    const onTransmitChange = vi.fn();
    const { unmount } = renderHook(() =>
      usePushToTalkBinding({
        isClient: true,
        enabled: true,
        micEnabled: true,
        onTransmitChange,
      }),
    );
    const button = document.createElement("button");
    const child = document.createElement("span");
    button.appendChild(child);
    document.body.appendChild(button);

    const down = new KeyboardEvent("keydown", {
      code: "Space",
      bubbles: true,
      cancelable: true,
    });
    const up = new KeyboardEvent("keyup", {
      code: "Space",
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      child.dispatchEvent(down);
      child.dispatchEvent(up);
    });

    expect(onTransmitChange).not.toHaveBeenCalledWith(true);
    expect(down.defaultPrevented).toBe(false);
    expect(up.defaultPrevented).toBe(false);
    button.remove();
    unmount();
  });

  it("still uses Space as push-to-talk away from controls", () => {
    const onTransmitChange = vi.fn();
    const { unmount } = renderHook(() =>
      usePushToTalkBinding({
        isClient: true,
        enabled: true,
        micEnabled: true,
        onTransmitChange,
      }),
    );

    act(() => fireEvent.keyDown(window, { code: "Space" }));
    expect(onTransmitChange).toHaveBeenLastCalledWith(true);
    act(() => fireEvent.keyUp(window, { code: "Space" }));
    expect(onTransmitChange).toHaveBeenLastCalledWith(false);
    unmount();
  });

  it("does not transmit when a mouse binding clicks an interactive control", () => {
    const onTransmitChange = vi.fn();
    const { result, unmount } = renderHook(() =>
      usePushToTalkBinding({
        isClient: true,
        enabled: true,
        micEnabled: true,
        onTransmitChange,
      }),
    );
    act(() => {
      result.current.setBinding({
        type: "mouse",
        button: 0,
        ctrl: false,
        alt: false,
        shift: false,
        meta: false,
      });
    });

    const button = document.createElement("button");
    const child = document.createElement("span");
    button.appendChild(child);
    document.body.appendChild(button);
    const down = new MouseEvent("mousedown", {
      button: 0,
      bubbles: true,
      cancelable: true,
    });
    const up = new MouseEvent("mouseup", {
      button: 0,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      child.dispatchEvent(down);
      child.dispatchEvent(up);
    });

    expect(onTransmitChange).not.toHaveBeenCalledWith(true);
    expect(down.defaultPrevented).toBe(false);
    expect(up.defaultPrevented).toBe(false);
    button.remove();
    unmount();
  });

  it("lets push-to-talk own Space without also toggling playback", () => {
    const onTransmitChange = vi.fn();
    const handleUserPause = vi.fn();
    const { unmount } = renderHook(() => {
      usePushToTalkBinding({
        isClient: true,
        enabled: true,
        micEnabled: true,
        onTransmitChange,
      });
      useKeyboardShortcuts({
        enabled: true,
        canControlPlayback: true,
        isPlaying: true,
        currentTime: 10,
        volume: 1,
        effectiveMuted: false,
        handleUserPlay: vi.fn(),
        handleUserPause,
        handleSeekFromController: vi.fn(),
        handleVolumeFromController: vi.fn(),
        toggleLocalMute: vi.fn(),
        togglePlayerFullscreen: vi.fn(),
      });
    });

    const down = new KeyboardEvent("keydown", {
      key: " ",
      code: "Space",
      bubbles: true,
      cancelable: true,
    });
    act(() => window.dispatchEvent(down));

    expect(onTransmitChange).toHaveBeenLastCalledWith(true);
    expect(down.defaultPrevented).toBe(true);
    expect(handleUserPause).not.toHaveBeenCalled();
    act(() =>
      window.dispatchEvent(
        new KeyboardEvent("keyup", {
          key: " ",
          code: "Space",
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    unmount();
  });
});
