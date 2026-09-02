import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

// The room view pulls in the whole room; only the pieces this behaviour
// depends on need to be real. PlayerSection is stubbed with a marker so the
// test can assert it is still mounted, which is the entire point of the mode.
vi.mock("../../components/PlayerSection", async () => {
  const React = await import("react");
  return {
    PlayerSection: () =>
      React.createElement("div", { "data-testid": "player-section" }),
  };
});
vi.mock("../../components/CallSidebar", async () => {
  const React = await import("react");
  return {
    CallSidebar: () =>
      React.createElement("div", { "data-testid": "call-sidebar" }),
  };
});
vi.mock("../../components/ActivitySidebar", () => ({
  ActivitySidebar: () => null,
}));
vi.mock("../../components/WheelPickerModal", () => ({
  WheelPickerModal: () => null,
}));
vi.mock("../../components/PasswordModal", () => ({
  PasswordModal: () => null,
}));
vi.mock("../../components/VideoPreviewModal", () => ({
  VideoPreviewModal: () => null,
}));
vi.mock("../../components/RoomHeader", () => ({ RoomHeader: () => null }));
vi.mock("../../components/RoomAccessError", () => ({
  RoomAccessError: () => null,
}));
vi.mock("../../components/PlaylistPanel", () => ({
  PlaylistPanel: () => null,
}));
vi.mock("../../components/AddToPlaylistModal", () => ({
  AddToPlaylistModal: () => null,
}));
vi.mock("../../components/AddVideosToPlaylistModal", () => ({
  AddVideosToPlaylistModal: () => null,
}));
vi.mock("../../components/GameModal", () => ({ GameModal: () => null }));
vi.mock("../../components/ReconnectBanner", () => ({
  ReconnectBanner: () => null,
}));
vi.mock("../../components/RoomSettingsPanel", () => ({
  RoomSettingsPanel: () => null,
}));
vi.mock("../../components/TimerModal", () => ({ TimerModal: () => null }));

import { RoomClientView } from "../RoomClientView";
import { ChatModeBar } from "../../components/ChatModeBar";

const baseProps = {
  roomId: "room-1",
  isClient: true,
  passwordRequired: false,
  roomAccessError: null,
  headerProps: {},
  passwordModalProps: {},
  wheelPickerModalProps: {},
  isActivityCollapsed: false,
  isTheatreMode: false,
  chatModeBarProps: {
    isMuted: false,
    onToggleMuted: vi.fn(),
    onShowVideo: vi.fn(),
  },
  playerSectionProps: {},
  callSidebarProps: {},
  activitySidebarProps: {},
  videoPreviewModalProps: null,
  isPlaylistPanelOpen: false,
  playlistPanelProps: {},
  addToPlaylistModalProps: {},
  addVideosToPlaylistModalProps: {},
  gameModalProps: {},
  reconnectBannerProps: {},
  roomSettingsPanelProps: {},
  timerModalProps: {},
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

describe("chat-only mode", () => {
  it("keeps the player mounted so audio and sync survive being hidden", () => {
    const { rerender } = render(
      <RoomClientView {...baseProps} isChatOnlyMode={false} />,
    );
    const before = screen.getByTestId("player-section");

    rerender(<RoomClientView {...baseProps} isChatOnlyMode />);

    // Still the very same element — unmounting would stop the audio the user
    // explicitly asked to keep and drop the element the sync engine drives.
    const after = screen.getByTestId("player-section");
    expect(after).toBe(before);

    // ...but taken out of view and out of reach of keyboard and screen readers.
    const wrapper = after.parentElement as HTMLElement;
    expect(wrapper.getAttribute("aria-hidden")).toBe("true");
    expect(wrapper.hasAttribute("inert")).toBe(true);
    expect(wrapper.className).toContain("left-[-9999px]");
  });

  it("shows the way back and the sound control only in chat-only mode", () => {
    const { rerender } = render(
      <RoomClientView {...baseProps} isChatOnlyMode={false} />,
    );
    expect(screen.queryByRole("button", { name: "Show video" })).toBeNull();

    rerender(<RoomClientView {...baseProps} isChatOnlyMode />);
    expect(screen.getByRole("button", { name: "Show video" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Turn sound off" })).toBeTruthy();
  });

  it("keeps the call sidebar, because hiding video is not leaving the call", () => {
    render(<RoomClientView {...baseProps} isChatOnlyMode />);
    expect(screen.getByTestId("call-sidebar")).toBeTruthy();
  });
});

describe("ChatModeBar", () => {
  it("offers to silence audio while it plays, and to restore it once muted", async () => {
    const onToggleMuted = vi.fn();
    const { rerender } = render(
      <ChatModeBar
        isMuted={false}
        onToggleMuted={onToggleMuted}
        onShowVideo={vi.fn()}
      />,
    );

    const off = screen.getByRole("button", { name: "Turn sound off" });
    expect(off.getAttribute("aria-pressed")).toBe("false");
    await userEvent.click(off);
    expect(onToggleMuted).toHaveBeenCalledTimes(1);

    rerender(
      <ChatModeBar
        isMuted
        onToggleMuted={onToggleMuted}
        onShowVideo={vi.fn()}
      />,
    );
    const on = screen.getByRole("button", { name: "Turn sound on" });
    expect(on.getAttribute("aria-pressed")).toBe("true");
  });
});
