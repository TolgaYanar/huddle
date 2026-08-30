import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PlaylistItemRow } from "../PlaylistItemRow";

const item = {
  id: "item-1",
  playlistId: "playlist-1",
  videoUrl: "https://example.com/video",
  title: "Keyboard video",
  duration: 125,
  thumbnail: undefined,
  addedBy: "alice",
  addedByUsername: "Alice",
  position: 0,
  addedAt: Date.now(),
};

function renderRow(overrides: Record<string, unknown> = {}) {
  const props = {
    item,
    index: 0,
    isActive: false,
    isPlaying: false,
    isDragging: false,
    isDragOver: false,
    canMoveUp: true,
    canMoveDown: true,
    onPlay: vi.fn(),
    onRemove: vi.fn(),
    onMoveUp: vi.fn(),
    onMoveDown: vi.fn(),
    onDragStart: vi.fn(),
    onDragOver: vi.fn(),
    onDragEnd: vi.fn(),
    onDrop: vi.fn(),
    ...overrides,
  };
  render(<PlaylistItemRow {...props} />);
  return props;
}

describe("PlaylistItemRow keyboard access", () => {
  it("exposes playback as a native button operable with Enter", async () => {
    const user = userEvent.setup();
    const props = renderRow();
    const play = screen.getByRole("button", { name: "Play Keyboard video" });

    play.focus();
    await user.keyboard("{Enter}");

    expect(props.onPlay).toHaveBeenCalledOnce();
  });

  it("keeps removal as an independent keyboard action", async () => {
    const user = userEvent.setup();
    const props = renderRow();
    const remove = screen.getByRole("button", {
      name: "Remove from playlist",
    });

    remove.focus();
    await user.keyboard(" ");

    expect(props.onRemove).toHaveBeenCalledOnce();
    expect(props.onPlay).not.toHaveBeenCalled();
  });

  it("marks the active item for assistive technology", () => {
    renderRow({ isActive: true });

    expect(
      screen.getByRole("button", { name: "Play Keyboard video" }),
    ).toHaveAttribute("aria-current", "true");
  });

  it("exposes reorder controls and disables unavailable directions", async () => {
    const user = userEvent.setup();
    const props = renderRow({ canMoveUp: false });
    const moveUp = screen.getByRole("button", {
      name: "Move Keyboard video up",
    });
    const moveDown = screen.getByRole("button", {
      name: "Move Keyboard video down",
    });

    expect(moveUp).toBeDisabled();
    await user.click(moveDown);
    expect(props.onMoveDown).toHaveBeenCalledOnce();
    expect(props.onPlay).not.toHaveBeenCalled();
  });
});
