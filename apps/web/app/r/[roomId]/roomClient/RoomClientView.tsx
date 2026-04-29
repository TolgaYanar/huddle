import React from "react";

import { CallSidebar } from "../components/CallSidebar";
import { ActivitySidebar } from "../components/ActivitySidebar";
import { PlayerSection } from "../components/PlayerSection";
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

  const gridColsClass = isTheatreMode
    ? isActivityCollapsed
      ? "lg:grid-cols-[minmax(0,1fr)]"
      : "lg:grid-cols-[minmax(0,1fr)_340px]"
    : isActivityCollapsed
      ? "lg:grid-cols-[280px_minmax(0,1fr)]"
      : "lg:grid-cols-[280px_minmax(0,1fr)_340px]";

  return (
    <div className="relative min-h-screen flex flex-col bg-linear-to-b from-slate-900 via-slate-950 to-black text-slate-200">
      {/* Ambient background accent — kept behind everything else */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[80rem] h-[40rem] rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="absolute top-1/3 -right-32 w-[28rem] h-[28rem] rounded-full bg-fuchsia-500/10 blur-3xl" />
        <div className="absolute bottom-0 -left-32 w-[32rem] h-[32rem] rounded-full bg-sky-500/10 blur-3xl" />
      </div>

      {isReady && headerProps && (
        <RoomHeader roomId={roomId} {...headerProps} />
      )}

      <PasswordModal {...passwordModalProps} />

      <WheelPickerModal {...wheelPickerModalProps} />

      {isReady && (
        <main
          className={`flex-1 grid grid-cols-1 ${gridColsClass} gap-4 px-4 sm:px-6 lg:px-8 2xl:px-12 py-4 sm:py-6 max-w-screen-2xl 2xl:max-w-none mx-auto w-full transition-[grid-template-columns] duration-300 ease-out`}
        >
          <PlayerSection
            {...playerSectionProps}
          />
          {!isTheatreMode && <CallSidebar {...callSidebarProps} />}
          <ActivitySidebar
            {...activitySidebarProps}
            isTheatreMode={isTheatreMode}
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
