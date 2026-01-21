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

export type RoomClientViewProps = {
  roomId: string;

  isClient: boolean;
  passwordRequired: boolean;
  roomAccessError: React.ComponentProps<typeof RoomAccessError>["error"] | null;

  headerProps: Omit<React.ComponentProps<typeof RoomHeader>, "roomId"> | null;
  passwordModalProps: React.ComponentProps<typeof PasswordModal>;
  wheelPickerModalProps: React.ComponentProps<typeof WheelPickerModal>;

  isActivityCollapsed: boolean;
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
  playerSectionProps,
  callSidebarProps,
  activitySidebarProps,
  videoPreviewModalProps,
  isPlaylistPanelOpen,
  playlistPanelProps,
  addToPlaylistModalProps,
  addVideosToPlaylistModalProps,
}: RoomClientViewProps) {
  if (roomAccessError) {
    return <RoomAccessError error={roomAccessError} />;
  }

  const isReady = isClient && !passwordRequired;

  return (
    <div className="min-h-screen flex flex-col bg-linear-to-b from-slate-900 via-slate-950 to-black text-slate-200">
      {isReady && headerProps && (
        <RoomHeader roomId={roomId} {...headerProps} />
      )}

      <PasswordModal {...passwordModalProps} />

      <WheelPickerModal {...wheelPickerModalProps} />

      {isReady && (
        <main
          className={`flex-1 grid grid-cols-1 ${
            isActivityCollapsed
              ? "lg:grid-cols-[280px_minmax(0,1fr)]"
              : "lg:grid-cols-[280px_minmax(0,1fr)_320px]"
          } gap-4 px-6 lg:px-8 2xl:px-12 py-6 max-w-screen-2xl 2xl:max-w-none mx-auto w-full`}
        >
          <PlayerSection {...playerSectionProps} />
          <CallSidebar {...callSidebarProps} />
          <ActivitySidebar {...activitySidebarProps} />
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
    </div>
  );
}
