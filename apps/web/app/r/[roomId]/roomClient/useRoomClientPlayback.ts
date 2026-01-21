import { useCallback, useMemo, useRef, useState } from "react";

import type { useRoom as useRoomFn } from "shared-logic";

import {
  useActivityLog,
  usePlaylist,
  useVideoPlayer,
  useWheelPicker,
} from "../hooks";
import { getCurrentTimeFromRef } from "../lib/player";

import { useMediaSessionControls } from "./useMediaSessionControls";

type Room = ReturnType<typeof useRoomFn>;

type RoomPlaybackAnchor = {
  url: string;
  isPlaying: boolean;
  anchorTime: number;
  anchorAt: number;
  playbackRate: number;
};

export function useRoomClientPlayback(args: {
  roomId: string;
  userId: string;
  isClient: boolean;
  room: Room;
  sendSyncEvent: Room["sendSyncEvent"];
  hasInitialSyncRef: React.MutableRefObject<boolean>;
}) {
  const { roomId, userId, isClient, room, sendSyncEvent, hasInitialSyncRef } =
    args;

  const applyingRemoteSyncRef = useRef(false);

  const roomPlaybackAnchorRef = useRef<RoomPlaybackAnchor | null>(null);
  const [roomPlaybackAnchorVersion, setRoomPlaybackAnchorVersion] = useState(0);
  const onRoomPlaybackAnchorUpdated = useCallback(() => {
    setRoomPlaybackAnchorVersion((v) => v + 1);
  }, []);

  const lastManualSeekRef = useRef<number>(0);

  const [audioSyncEnabled, setAudioSyncEnabled] = useState(true);

  const video = useVideoPlayer({
    isClient,
    roomId,
    sendSyncEvent,
    audioSyncEnabled,
    applyingRemoteSyncRef,
    lastManualSeekRef,
    hasInitialSyncRef,
  });

  const handleAudioSyncEnabledChange = useCallback(
    (nextEnabled: boolean) => {
      setAudioSyncEnabled(nextEnabled);
      const t = getCurrentTimeFromRef(video.playerRef);
      sendSyncEvent("set_audio_sync", t, video.url, {
        audioSyncEnabled: nextEnabled,
      });
    },
    [sendSyncEvent, video.playerRef, video.url],
  );

  const activity = useActivityLog({
    roomId,
    userId,
    isConnected: room.isConnected,
    playerRef: video.playerRef,
    applyingRemoteSyncRef,
    lastUserPauseAtRef: video.lastUserPauseAtRef,
    hasInitialSyncRef,
    roomPlaybackAnchorRef,
    onRoomPlaybackAnchorUpdated,
    setUrl: video.setUrl,
    setInputUrl: video.setInputUrl,
    setVideoState: video.setVideoState,
    setMuted: video.setMuted,
    setVolume: video.setVolume,
    setPlaybackRate: video.setPlaybackRate,
    setAudioSyncEnabled,
    setPlayerReady: video.setPlayerReady,
    setPlayerError: video.setPlayerError,
    onSyncEvent: room.onSyncEvent,
    onRoomState: room.onRoomState,
    onChatHistory: room.onChatHistory,
    onChatMessage: room.onChatMessage,
    onActivityHistory: room.onActivityHistory,
    onActivityEvent: room.onActivityEvent,
    requestRoomState: room.requestRoomState,
    requestChatHistory: room.requestChatHistory,
    requestActivityHistory: room.requestActivityHistory,
    sendChatMessage: room.sendChatMessage,
  });

  const wheel = useWheelPicker({
    roomId,
    onWheelState: room.onWheelState,
    onWheelSpun: room.onWheelSpun,
    requestWheelState: room.requestWheelState,
    addWheelEntry: room.addWheelEntry,
    removeWheelEntry: room.removeWheelEntry,
    clearWheelEntries: room.clearWheelEntries,
    spinWheel: room.spinWheel,
  });

  const playlist = usePlaylist({
    roomId,
    onPlaylistState: room.onPlaylistState,
    onPlaylistItemPlayed: room.onPlaylistItemPlayed,
    requestPlaylistState: room.requestPlaylistState,
    createPlaylist: room.createPlaylist,
    updatePlaylist: room.updatePlaylist,
    deletePlaylist: room.deletePlaylist,
    addPlaylistItem: room.addPlaylistItem,
    removePlaylistItem: room.removePlaylistItem,
    reorderPlaylistItems: room.reorderPlaylistItems,
    setActivePlaylist: room.setActivePlaylist,
    playPlaylistItem: room.playPlaylistItem,
    playNextInPlaylist: room.playNextInPlaylist,
    playPreviousInPlaylist: room.playPreviousInPlaylist,
    loadVideoUrl: video.loadVideoUrl,
  });

  const lastPlaylistAdvanceAtRef = useRef(0);
  const handleVideoEnded = useCallback(() => {
    const now = Date.now();
    if (now - lastPlaylistAdvanceAtRef.current < 2000) return;
    lastPlaylistAdvanceAtRef.current = now;

    if (playlist.activePlaylist?.settings?.autoPlay) {
      playlist.playNext();
    }
  }, [playlist]);

  useMediaSessionControls({
    isClient,
    activePlaylist: playlist.activePlaylist,
    currentItemIndex: playlist.currentItemIndex,
    videoState: video.videoState,
    onPlay: video.handlePlay,
    onPause: video.handleUserPause,
    onNext: playlist.playNext,
    onPrevious: playlist.playPrevious,
  });

  const fullscreenChatMessages = useMemo(() => {
    return activity.logs.filter((l) => l.type === "chat").slice(-30);
  }, [activity.logs]);

  return {
    video,
    activity,
    wheel,
    playlist,

    applyingRemoteSyncRef,
    roomPlaybackAnchorRef,
    roomPlaybackAnchorVersion,
    lastManualSeekRef,

    audioSyncEnabled,
    handleAudioSyncEnabledChange,

    fullscreenChatMessages,
    handleVideoEnded,
  };
}
