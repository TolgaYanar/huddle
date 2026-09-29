import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useKeyboardShortcuts } from "../useKeyboardShortcuts";

function setup(overrides: { canControlPlayback?: boolean } = {}) {
  const props = {
    enabled: true,
    canControlPlayback: overrides.canControlPlayback ?? true,
    isPlaying: false,
    currentTime: 30,
    volume: 0.5,
    effectiveMuted: false,
    handleUserPlay: vi.fn(),
    handleUserPause: vi.fn(),
    handleSeekFromController: vi.fn(),
    handleVolumeFromController: vi.fn(),
    toggleLocalMute: vi.fn(),
    togglePlayerFullscreen: vi.fn(),
  };
  const hook = renderHook(() => useKeyboardShortcuts(props));
  return { props, ...hook };
}

function press(key: string, target: EventTarget = document.body) {
  const ev = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(ev);
  return ev;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("useKeyboardShortcuts", () => {
  it("toggles playback on Space when nothing interactive is focused", () => {
    const { props } = setup();
    const ev = press(" ");
    expect(props.handleUserPlay).toHaveBeenCalledOnce();
    expect(ev.defaultPrevented).toBe(true);
  });

  it("leaves Space to a focused button", () => {
    const { props } = setup();
    const button = document.createElement("button");
    document.body.appendChild(button);
    button.focus();

    const ev = press(" ", button);

    expect(props.handleUserPlay).not.toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(false);
  });

  it("still honours k on a focused button", () => {
    const { props } = setup();
    const button = document.createElement("button");
    document.body.appendChild(button);
    button.focus();

    press("k", button);

    expect(props.handleUserPlay).toHaveBeenCalledOnce();
  });

  it("does not swallow Space for viewers who cannot control playback", () => {
    setup({ canControlPlayback: false });
    const ev = press(" ");
    expect(ev.defaultPrevented).toBe(false);
  });

  it("leaves arrow keys to a focused slider but seeks otherwise", () => {
    const { props } = setup();
    const slider = document.createElement("div");
    slider.setAttribute("role", "slider");
    slider.tabIndex = 0;
    document.body.appendChild(slider);
    slider.focus();

    press("ArrowRight", slider);
    expect(props.handleSeekFromController).not.toHaveBeenCalled();

    slider.blur();
    press("ArrowRight");
    expect(props.handleSeekFromController).toHaveBeenCalledWith(40, {
      force: true,
    });
  });
});
