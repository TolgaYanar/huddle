import React from "react";

import { CallSidebar } from "../components/CallSidebar";
import { ActivitySidebar } from "../components/ActivitySidebar";
import { PlayerSection } from "../components/PlayerSection";
import { ChatModeBar } from "../components/ChatModeBar";
import { WheelPickerModal } from "../components/WheelPickerModal";
import { PasswordModal } from "../components/PasswordModal";
import { VideoPreviewModal } from "../components/VideoPreviewModal";
import { RoomHeader } from "../components/RoomHeader";
import { RoomAccessError } from "../components/RoomAccessError";
import { PlaylistPanel } from "../components/PlaylistPanel";
import { AddToPlaylistModal } from "../components/AddToPlaylistModal";
import { AddVideosToPlaylistModal } from "../components/AddVideosToPlaylistModal";
import { GameModal } from "../components/GameModal";
import { ReconnectBanner } from "../components/ReconnectBanner";
import { RoomSettingsPanel } from "../components/RoomSettingsPanel";
import type { RoomSettingsPanelProps } from "../components/RoomSettingsPanel";
import { TimerModal } from "../components/TimerModal";
import type { TimerModalProps } from "../components/TimerModal";

export type RoomClientViewProps = {
  roomId: string;

  isClient: boolean;
  passwordRequired: boolean;
  roomAccessError: React.ComponentProps<typeof RoomAccessError>["error"] | null;

  headerProps: Omit<React.ComponentProps<typeof RoomHeader>, "roomId"> | null;
  passwordModalProps: React.ComponentProps<typeof PasswordModal>;
  wheelPickerModalProps: React.ComponentProps<typeof WheelPickerModal>;

  isActivityCollapsed: boolean;
  isTheatreMode: boolean;
  isChatOnlyMode: boolean;
  chatModeBarProps: React.ComponentProps<typeof ChatModeBar>;
  playerSectionProps: React.ComponentProps<typeof PlayerSection>;
  callSidebarProps: React.ComponentProps<typeof CallSidebar>;
  activitySidebarProps: React.ComponentProps<typeof ActivitySidebar>;

  videoPreviewModalProps: React.ComponentProps<typeof VideoPreviewModal> | null;

  isPlaylistPanelOpen: boolean;
  playlistPanelProps: React.ComponentProps<typeof PlaylistPanel>;

  addToPlaylistModalProps: React.ComponentProps<typeof AddToPlaylistModal>;
  addVideosToPlaylistModalProps: React.ComponentProps<
    typeof AddVideosToPlaylistModal
  >;

  gameModalProps: React.ComponentProps<typeof GameModal>;
  reconnectBannerProps: React.ComponentProps<typeof ReconnectBanner>;
  roomSettingsPanelProps: RoomSettingsPanelProps;
  timerModalProps: TimerModalProps;
};

export function RoomClientView({
  roomId,
  isClient,
  passwordRequired,
  roomAccessError,
  headerProps,
  passwordModalProps,
  wheelPickerModalProps,
  isActivityCollapsed,
  isTheatreMode,
  isChatOnlyMode,
  chatModeBarProps,
  playerSectionProps,
  callSidebarProps,
  activitySidebarProps,
  videoPreviewModalProps,
  isPlaylistPanelOpen,
  playlistPanelProps,
  addToPlaylistModalProps,
  addVideosToPlaylistModalProps,
  gameModalProps,
  reconnectBannerProps,
  roomSettingsPanelProps,
  timerModalProps,
}: RoomClientViewProps) {
  if (roomAccessError) {
    return <RoomAccessError error={roomAccessError} />;
  }

  const isReady = isClient && !passwordRequired;

  // Chat-only mode gives the conversation the room the player was using. The
  // call sidebar stays, because hiding the video is not a reason to drop out
  // of a voice call.
  const gridColsClass = isChatOnlyMode
    ? isActivityCollapsed
      ? "lg:grid-cols-[280px_minmax(0,1fr)]"
      : "lg:grid-cols-[280px_minmax(0,1fr)_minmax(340px,520px)]"
    : isTheatreMode
      ? isActivityCollapsed
        ? "lg:grid-cols-[minmax(0,1fr)]"
        : "lg:grid-cols-[minmax(0,1fr)_340px]"
      : isActivityCollapsed
        ? "lg:grid-cols-[280px_minmax(0,1fr)]"
        : "lg:grid-cols-[280px_minmax(0,1fr)_340px]";

  return (
    <div className="relative min-h-screen flex flex-col bg-bg text-ink">
      {isReady && headerProps && (
        <RoomHeader roomId={roomId} {...headerProps} />
      )}

      <PasswordModal {...passwordModalProps} />

      <WheelPickerModal {...wheelPickerModalProps} />

      {isReady && (
        <main
          className={`flex-1 grid grid-cols-1 ${gridColsClass} gap-4 px-4 sm:px-6 lg:px-8 2xl:px-12 py-4 sm:py-6 max-w-screen-2xl 2xl:max-w-none mx-auto w-full transition-[grid-template-columns] duration-300 ease-out`}
        >
          {isChatOnlyMode && <ChatModeBar {...chatModeBarProps} />}
          {/*
            The player is moved off-screen rather than unmounted. Unmounting it
            would stop the audio the user asked to keep, drop the YouTube/HTML5
            element the sync engine drives, and make re-showing the video a
            fresh load that re-seeks the room. `display: contents` keeps
            PlayerSection as the direct grid child it is today whenever the
            mode is off, so the normal layout is untouched.
          */}
          <div
            className={
              isChatOnlyMode
                ? // A viewport-relative offset does not clear a fixed-width box on a
                  // narrow screen: at 390px, -200vw is -780px and 180px of the
                  // 960px player stayed visible over the chat. Use an absolute
                  // offset that clears it at every viewport width.
                  "fixed left-[-9999px] top-0 w-[960px] h-[540px] pointer-events-none"
                : "contents"
            }
            aria-hidden={isChatOnlyMode || undefined}
            inert={isChatOnlyMode}
          >
            <PlayerSection {...playerSectionProps} />
          </div>
          {/*
            Chat-only mode wins over theatre mode here. Theatre hides the call
            to give the video the whole row, but in chat-only mode there is no
            video on the row — dropping the call would take the user out of a
            voice call for a reason that no longer exists, and would leave the
            column it occupies empty.
          */}
          {(!isTheatreMode || isChatOnlyMode) && (
            <CallSidebar {...callSidebarProps} />
          )}
          <ActivitySidebar
            {...activitySidebarProps}
            isTheatreMode={isTheatreMode && !isChatOnlyMode}
          />
        </main>
      )}

      {isReady && videoPreviewModalProps && (
        <VideoPreviewModal {...videoPreviewModalProps} />
      )}

      {isReady && isPlaylistPanelOpen && (
        <div className="fixed inset-y-0 right-0 z-40 w-80 max-w-full">
          <div className="h-full pt-16 pb-4 pr-4">
            <PlaylistPanel {...playlistPanelProps} />
          </div>
        </div>
      )}

      {isReady && <AddToPlaylistModal {...addToPlaylistModalProps} />}
      {isReady && (
        <AddVideosToPlaylistModal {...addVideosToPlaylistModalProps} />
      )}

      {isReady && <GameModal {...gameModalProps} />}

      {isClient && <ReconnectBanner {...reconnectBannerProps} />}

      {isReady && <RoomSettingsPanel {...roomSettingsPanelProps} />}
      {isReady && <TimerModal {...timerModalProps} />}
    </div>
  );
}
