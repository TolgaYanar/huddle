import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FullscreenChatOverlay } from "../FullscreenChatOverlay";

const playerContainerRef = React.createRef<HTMLDivElement>();
const setOpen = vi.fn();
const sendChat = vi.fn(() => true);

function messages(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    msg: `message-${index}`,
    time: "12:00",
    user: "Alice",
  }));
}

function overlay(messagesValue: ReturnType<typeof messages>, open = true) {
  return (
    <FullscreenChatOverlay
      isPlayerFullscreen
      open={open}
      setOpen={setOpen}
      playerContainerRef={playerContainerRef}
      isConnected
      messages={messagesValue}
      sendChat={sendChat}
    />
  );
}

function setScrollGeometry(element: HTMLElement) {
  Object.defineProperty(element, "scrollHeight", {
    configurable: true,
    value: 1000,
  });
  Object.defineProperty(element, "clientHeight", {
    configurable: true,
    value: 200,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("FullscreenChatOverlay follow-to-bottom", () => {
  it("follows new messages while the reader is at the bottom", () => {
    const { rerender } = render(overlay(messages(3)));
    const region = screen.getByRole("region", {
      name: "Fullscreen chat messages",
    });
    setScrollGeometry(region);

    region.scrollTop = 800;
    fireEvent.scroll(region);
    region.scrollTop = 0;
    rerender(overlay(messages(4)));

    expect(region.scrollTop).toBe(1000);
  });

  it("does not move a reader who scrolled up", () => {
    const { rerender } = render(overlay(messages(3)));
    const region = screen.getByRole("region", {
      name: "Fullscreen chat messages",
    });
    setScrollGeometry(region);

    region.scrollTop = 100;
    fireEvent.scroll(region);
    rerender(overlay(messages(4)));

    expect(region.scrollTop).toBe(100);
  });

  it("opens a newly mounted chat panel at the newest message", () => {
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(
      1000,
    );
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(200);
    const currentMessages = messages(4);
    const { rerender } = render(overlay(currentMessages));
    let region = screen.getByRole("region", {
      name: "Fullscreen chat messages",
    });

    region.scrollTop = 100;
    fireEvent.scroll(region);
    rerender(overlay(currentMessages, false));
    rerender(overlay(currentMessages));
    region = screen.getByRole("region", {
      name: "Fullscreen chat messages",
    });

    expect(region.scrollTop).toBe(1000);
  });
});
