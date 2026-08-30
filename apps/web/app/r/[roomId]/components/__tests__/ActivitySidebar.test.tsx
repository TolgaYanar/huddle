import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ActivitySidebar, type ActivityLogEntry } from "../ActivitySidebar";
import type { CupGamePanelProps } from "../cupGame/CupGamePanel";
import type { GamePanelProps } from "../GamePanel";

const gameProps: GamePanelProps = {
  gameState: { roomId: "room-1", games: [] },
  mySocketId: "socket-1",
  isRoomHost: false,
  createGame: vi.fn(),
  addRounds: vi.fn(),
  removeRounds: vi.fn(),
  startSession: vi.fn(),
  submitGuess: vi.fn(),
  revealHint: vi.fn(),
  skipTurn: vi.fn(),
  endRound: vi.fn(),
  nextRound: vi.fn(),
  endSession: vi.fn(),
  setObserver: vi.fn(),
  resetGame: vi.fn(),
};

const cupGameProps: CupGamePanelProps = {
  cupGameState: { roomId: "room-1", games: [] },
  mySocketId: "socket-1",
  isRoomHost: false,
  createCupGame: vi.fn(),
  updateCupGameConfig: vi.fn(),
  startCupGamePlacement: vi.fn(),
  toggleCupGameSpider: vi.fn(),
  lockCupGamePlacement: vi.fn(),
  unlockCupGamePlacement: vi.fn(),
  flipCup: vi.fn(),
  drawCupGameCard: vi.fn(),
  resolveCupGameCard: vi.fn(),
  cancelCupGameCard: vi.fn(),
  resetCupGame: vi.fn(),
};

const message: ActivityLogEntry = {
  id: "message-1",
  msg: "Hello room",
  type: "chat",
  time: "12:00",
  user: "Alice",
};

function sidebarElement(
  logs: ActivityLogEntry[],
  addReaction = vi.fn(),
  sendChat = vi.fn(() => true),
) {
  return (
    <ActivitySidebar
      roomId="room-1"
      userId="socket-1"
      isConnected
      isActivityCollapsed={false}
      setIsActivityCollapsed={vi.fn()}
      logs={logs}
      logsEndRef={React.createRef<HTMLDivElement>()}
      capitalize={(value) => value}
      sendChat={sendChat}
      reactions={{}}
      addReaction={addReaction}
      gameProps={gameProps}
      cupGameProps={cupGameProps}
      onOpenGame={vi.fn()}
    />
  );
}

function manyLogs(count: number): ActivityLogEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    ...message,
    id: `message-${i}`,
    msg: `entry-${i}`,
  }));
}

function renderSidebar(logs: ActivityLogEntry[] = [message]) {
  const addReaction = vi.fn();
  const sendChat = vi.fn(() => true);
  const view = render(
    <ActivitySidebar
      roomId="room-1"
      userId="socket-1"
      isConnected
      isActivityCollapsed={false}
      setIsActivityCollapsed={vi.fn()}
      logs={logs}
      logsEndRef={React.createRef<HTMLDivElement>()}
      capitalize={(value) => value}
      sendChat={sendChat}
      reactions={{}}
      addReaction={addReaction}
      gameProps={gameProps}
      cupGameProps={cupGameProps}
      onOpenGame={vi.fn()}
    />,
  );
  return { addReaction, sendChat, ...view };
}

describe("ActivitySidebar reaction accessibility", () => {
  it("opens the picker on focus and moves keyboard focus into reactions", async () => {
    const user = userEvent.setup();
    renderSidebar();
    const trigger = screen.getByRole("button", {
      name: "Add reaction to message from Alice",
    });

    act(() => trigger.focus());
    expect(
      screen.getByRole("group", { name: "Choose a reaction" }),
    ).toBeVisible();
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    await user.tab();
    expect(screen.getByRole("button", { name: "React with 👍" })).toHaveFocus();
  });

  it("lets a touch-style click choose a reaction and closes the picker", async () => {
    const user = userEvent.setup();
    const { addReaction } = renderSidebar();
    const trigger = screen.getByRole("button", {
      name: "Add reaction to message from Alice",
    });

    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "React with ❤️" }));

    expect(addReaction).toHaveBeenCalledWith("message-1", "❤️");
    expect(
      screen.queryByRole("group", { name: "Choose a reaction" }),
    ).toBeNull();
  });

  it("returns focus to the trigger after a reaction is chosen", async () => {
    // Choosing a reaction unmounts the picker. Without moving focus back, the
    // emoji button the user just activated disappears from under them and
    // focus falls to <body> — a keyboard user loses their place in the chat
    // log and has to tab in from the top again.
    const user = userEvent.setup();
    renderSidebar();
    const trigger = screen.getByRole("button", {
      name: "Add reaction to message from Alice",
    });

    act(() => trigger.focus());
    await user.tab();
    await user.keyboard("{Enter}");

    expect(document.body).not.toHaveFocus();
    expect(trigger).toHaveFocus();
  });

  it("closes the picker with Escape and restores trigger focus", async () => {
    const user = userEvent.setup();
    renderSidebar();
    const trigger = screen.getByRole("button", {
      name: "Add reaction to message from Alice",
    });

    act(() => trigger.focus());
    await user.tab();
    await user.keyboard("{Escape}");

    expect(
      screen.queryByRole("group", { name: "Choose a reaction" }),
    ).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("keeps the chat draft local and sends only on submit", async () => {
    const user = userEvent.setup();
    const { sendChat } = renderSidebar();
    const input = screen.getByRole("textbox");

    await user.type(input, "  hello room  ");
    expect(sendChat).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(sendChat).toHaveBeenCalledWith("  hello room  ");
    expect(input).toHaveValue("");
  });
});

describe("ActivitySidebar log windowing", () => {
  it("renders the newest 100 entries and reveals older entries in pages", async () => {
    const user = userEvent.setup();
    const logs = Array.from({ length: 250 }, (_, index) => ({
      id: `message-${index}`,
      msg: `entry-${index}`,
      type: "chat",
      time: "12:00",
      user: "Alice",
    }));

    renderSidebar(logs);
    const log = screen.getByRole("region", { name: "Room activity" });
    Object.defineProperty(log, "scrollHeight", {
      configurable: true,
      get: () => log.querySelectorAll("[data-activity-entry]").length * 10,
    });
    log.scrollTop = 40;

    expect(log.querySelectorAll("[data-activity-entry]")).toHaveLength(100);
    expect(screen.queryByText("entry-149")).toBeNull();
    expect(screen.getByText("entry-150")).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "Show 100 earlier messages" }),
    );
    expect(log.querySelectorAll("[data-activity-entry]")).toHaveLength(200);
    expect(screen.getByText("entry-50")).toBeVisible();
    expect(log.scrollTop).toBe(1040);

    await user.click(
      screen.getByRole("button", { name: "Show 50 earlier messages" }),
    );
    expect(log.querySelectorAll("[data-activity-entry]")).toHaveLength(250);
    expect(screen.getByText("entry-0")).toBeVisible();
    expect(log.scrollTop).toBe(1540);
    expect(
      screen.queryByRole("button", { name: /earlier messages/ }),
    ).toBeNull();
  });
});

describe("ActivitySidebar follow-to-bottom", () => {
  function scrollableLog(container: HTMLElement) {
    const log = container.querySelector<HTMLElement>(
      '[aria-label="Room activity"]',
    );
    if (!log) throw new Error("activity log region not found");
    // jsdom has no layout, so drive the geometry directly.
    Object.defineProperty(log, "scrollHeight", {
      configurable: true,
      value: 1000,
    });
    Object.defineProperty(log, "clientHeight", {
      configurable: true,
      value: 200,
    });
    return log;
  }

  it("follows new messages while the user sits at the bottom", () => {
    const { container, rerender } = renderSidebar(manyLogs(3));
    const log = scrollableLog(container);

    log.scrollTop = 800; // 1000 - 800 - 200 = 0 from the bottom
    fireEvent.scroll(log);

    log.scrollTop = 0;
    rerender(sidebarElement(manyLogs(4)));

    expect(log.scrollTop).toBe(1000);
  });

  it("does not yank the reader back down when scrolled up", () => {
    // The auto-scroll used to fire on every logs change with no proximity
    // check, so scrolling up to re-read history was undone by the next
    // message — which also defeats the "show earlier" control.
    const { container, rerender } = renderSidebar(manyLogs(3));
    const log = scrollableLog(container);

    log.scrollTop = 100; // 1000 - 100 - 200 = 700 from the bottom
    fireEvent.scroll(log);

    rerender(sidebarElement(manyLogs(4)));

    expect(log.scrollTop).toBe(100);
  });
});
