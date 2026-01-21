import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRoom } from "shared-logic";
import {
  useFullscreen,
  usePushToTalkBinding,
  useRoomState,
  useStagePinning,
} from "../hooks";
import type { RoomClientViewProps } from "./RoomClientView";
import { makeRoomClientViewProps } from "./makeRoomClientViewProps";
import { useUnhandledRejectionGuard } from "./useUnhandledRejectionGuard";
import { useGuardedSendSyncEvent } from "./useGuardedSendSyncEvent";
import { useCopyInvite, useInviteLink } from "./useInviteLink";
import { useVideoEmbedInfo } from "./useVideoEmbedInfo";
import { buildPlayerSectionProps } from "./buildPlayerSectionProps";
import { buildPlaylistPanelProps } from "./buildPlaylistPanelProps";
import { buildCallSidebarProps } from "./buildCallSidebarProps";
import { useRoomClientPlayback } from "./useRoomClientPlayback";
import { useRoomClientRtc } from "./useRoomClientRtc";

export function useRoomClientViewModel(roomId: string): RoomClientViewProps {
  const [userId, setUserId] = useState("");
  const [isClient, setIsClient] = useState(false);
  const [isCallCollapsed, setIsCallCollapsed] = useState(false);
  const [isActivityCollapsed, setIsActivityCollapsed] = useState(false);

  const [echoCancellationEnabled, setEchoCancellationEnabled] = useState(true);
  const [noiseSuppressionEnabled, setNoiseSuppressionEnabled] = useState(true);
  const [autoGainControlEnabled, setAutoGainControlEnabled] = useState(true);
  const [pushToTalkEnabled, setPushToTalkEnabled] = useState(false);
  const hasInitialSyncRef = useRef<boolean>(false);
  const mountTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    setIsClient(true);
    mountTimeRef.current = Date.now();
    hasInitialSyncRef.current = false;
  }, []);

  useUnhandledRejectionGuard();

  const room = useRoom(roomId, userId);

  const sendSyncEvent = useGuardedSendSyncEvent(
    room.sendSyncEvent,
    hasInitialSyncRef,
    mountTimeRef,
  );

  useEffect(() => {
    if (room.isConnected && room.socket?.id) {
      setUserId(room.socket.id);
    }
  }, [room.isConnected, room.socket?.id]);

  const {
    bindingLabel: pushToTalkBindingLabel,
    isRebinding: isRebindingPushToTalkKey,
    setIsRebinding: setIsRebindingPushToTalkKey,
    isDown: pushToTalkDown,
    isDownRef: pushToTalkDownRef,
    stopTransmit: stopPushToTalkTransmit,
  } = usePushToTalkBinding({
    isClient,
    enabled: pushToTalkEnabled,
    micEnabled: true,
  });

  const roomState = useRoomState({
    roomId,
    userId,
    socket: room.socket,
    onRoomUsers: room.onRoomUsers,
    onUserJoined: room.onUserJoined,
    onUserLeft: room.onUserLeft,
    onRoomPasswordStatus: room.onRoomPasswordStatus,
    onRoomPasswordRequired: room.onRoomPasswordRequired,
    joinRoom: room.joinRoom,
  });

  const playback = useRoomClientPlayback({
    roomId,
    userId,
    isClient,
    room,
    sendSyncEvent,
    hasInitialSyncRef,
  });

  const rtc = useRoomClientRtc({
    roomId,
    userId,
    isClient,
    room,
    echoCancellationEnabled,
    noiseSuppressionEnabled,
    autoGainControlEnabled,
    pushToTalkEnabled,
    pushToTalkDownRef,
  });

  const fullscreen = useFullscreen({ isClient });

  const stagePinning = useStagePinning({
    userId,
    ensureLocalStream: rtc.mediaTracks.ensureLocalStream,
    remoteStreams: rtc.remoteStreams,
  });

  const inviteLink = useInviteLink(roomId, isClient);
  const { copied, copyInvite } = useCopyInvite(inviteLink);

  const videoEmbed = useVideoEmbedInfo({
    isClient,
    normalizedUrl: playback.video.normalizedUrl,
    url: playback.video.url,
  });

  const remotesForPlayer = useMemo(() => {
    return rtc.remoteStreams.map((s) => ({
      id: s.id,
      stream: s.stream,
      media: rtc.remoteMedia[s.id],
    }));
  }, [rtc.remoteStreams, rtc.remoteMedia]);

  const handleOpenAddToPlaylist = useCallback(() => {
    if (playback.video.url) {
      playback.playlist.openAddToPlaylist(playback.video.url);
    }
  }, [playback.playlist, playback.video.url]);

  const [isAddVideosModalOpen, setIsAddVideosModalOpen] = useState(false);

  const playerSectionProps = buildPlayerSectionProps({
    isClient,
    isConnected: room.isConnected,
    video: playback.video,
    fullscreen,
    stagePinning,
    mediaTracks: rtc.mediaTracks,
    videoEmbed,
    remotesForPlayer,
    applyingRemoteSyncRef: playback.applyingRemoteSyncRef,
    roomPlaybackAnchorRef: playback.roomPlaybackAnchorRef,
    roomPlaybackAnchorVersion: playback.roomPlaybackAnchorVersion,
    lastManualSeekRef: playback.lastManualSeekRef,
    audioSyncEnabled: playback.audioSyncEnabled,
    onAudioSyncEnabledChange: playback.handleAudioSyncEnabledChange,
    fullscreenChatMessages: playback.fullscreenChatMessages,
    chatText: playback.activity.chatText,
    setChatText: playback.activity.setChatText,
    handleSendChat: playback.activity.handleSendChat,
    onVideoEnded: playback.handleVideoEnded,
  });

  const playlistPanelProps = buildPlaylistPanelProps({
    playlist: playback.playlist,
    currentVideoUrl: playback.video.url,
    onOpenAddVideos: () => setIsAddVideosModalOpen(true),
    onAddCurrentVideo: playback.video.url ? handleOpenAddToPlaylist : undefined,
  });

  const videoPreviewModalProps =
    isClient && !roomState.passwordRequired
      ? {
          showPreviewModal: playback.video.showPreviewModal,
          videoPreview: playback.video.videoPreview,
          isPreviewLoading: playback.video.isPreviewLoading,
          onLoadVideo: playback.video.loadVideoUrl,
          onClose: playback.video.closePreviewModal,
        }
      : null;

  const callSidebarProps = buildCallSidebarProps({
    userId,
    hostId: roomState.hostId,
    onKickUser: roomState.kickUser,
    participants: roomState.participants,
    usernamesById: roomState.usernamesById,
    hasRoomPassword: roomState.hasRoomPassword,
    onSetRoomPassword: room.setRoomPassword,
    localSpeaking: rtc.mediaTracks.localSpeaking,
    isCallCollapsed,
    setIsCallCollapsed,
    micEnabled: rtc.mediaTracks.micEnabled,
    setMicEnabled: rtc.mediaTracks.setMicEnabled,
    camEnabled: rtc.mediaTracks.camEnabled,
    setCamEnabled: rtc.mediaTracks.setCamEnabled,
    screenEnabled: rtc.mediaTracks.screenEnabled,
    setScreenEnabled: rtc.mediaTracks.setScreenEnabled,
    pushToTalkEnabled,
    setPushToTalkEnabled,
    pushToTalkDown,
    pushToTalkBindingLabel,
    stopPushToTalkTransmit,
    isRebindingPushToTalkKey,
    setIsRebindingPushToTalkKey,
    echoCancellationEnabled,
    setEchoCancellationEnabled,
    noiseSuppressionEnabled,
    setNoiseSuppressionEnabled,
    autoGainControlEnabled,
    setAutoGainControlEnabled,
    localVideoRef: rtc.mediaTracks.localVideoRef,
    remoteStreams: rtc.remoteStreams,
    remoteSpeaking: rtc.remoteSpeaking,
    remoteMedia: rtc.remoteMedia,
    setIsDraggingTile: stagePinning.setIsDraggingTile,
    setIsStageDragOver: stagePinning.setIsStageDragOver,
  });

  const addToPlaylistModalProps = {
    isOpen: playback.playlist.isAddToPlaylistOpen,
    onClose: playback.playlist.closeAddToPlaylist,
    playlists: playback.playlist.playlists,
    videoUrl: playback.playlist.pendingVideoUrl,
    onAddToPlaylist: playback.playlist.addItem,
    onCreatePlaylist: playback.playlist.createPlaylist,
  };

  const addVideosToPlaylistModalProps = {
    isOpen: isAddVideosModalOpen,
    onClose: () => setIsAddVideosModalOpen(false),
    playlists: playback.playlist.playlists,
    onAddToPlaylist: playback.playlist.addItem,
    onCreatePlaylist: playback.playlist.createPlaylist,
  };

  const headerProps =
    isClient && !roomState.passwordRequired
      ? {
          isConnected: room.isConnected,
          hasRoomPassword: roomState.hasRoomPassword,
          passwordRequired: roomState.passwordRequired,
          inviteLink,
          copied,
          onCopyInvite: copyInvite,
          onOpenWheel: () => playback.wheel.setIsWheelOpen(true),
          onOpenPlaylist: () =>
            playback.playlist.setIsPlaylistPanelOpen(
              !playback.playlist.isPlaylistPanelOpen,
            ),
          isPlaylistOpen: playback.playlist.isPlaylistPanelOpen,
        }
      : null;

  const passwordModalProps = {
    passwordRequired: roomState.passwordRequired,
    passwordInput: roomState.passwordInput,
    setPasswordInput: roomState.setPasswordInput,
    passwordError: roomState.passwordError,
    submitRoomPassword: roomState.submitRoomPassword,
  };

  const wheelPickerModalProps = {
    open: playback.wheel.isWheelOpen && !roomState.passwordRequired,
    onClose: () => playback.wheel.setIsWheelOpen(false),
    isConnected: room.isConnected,
    entries: playback.wheel.wheelEntries,
    lastSpin: playback.wheel.wheelLastSpin,
    onAddEntry: (text: string) => room.addWheelEntry?.(text),
    onRemoveEntry: (index: number) => room.removeWheelEntry?.(index),
    onClear: () => room.clearWheelEntries?.(),
    onSpin: () => room.spinWheel?.(),
  };

  const activitySidebarProps = {
    roomId,
    isConnected: room.isConnected,
    isActivityCollapsed,
    setIsActivityCollapsed,
    logs: playback.activity.logs,
    logsEndRef: playback.activity.logsEndRef,
    capitalize: (s: string) => s.charAt(0).toUpperCase() + s.slice(1),
    chatText: playback.activity.chatText,
    setChatText: playback.activity.setChatText,
    handleSendChat: playback.activity.handleSendChat,
  };

  return makeRoomClientViewProps({
    roomId,
    isClient,
    passwordRequired: roomState.passwordRequired,
    roomAccessError: roomState.roomAccessError,
    headerProps,
    passwordModalProps,
    wheelPickerModalProps,
    isActivityCollapsed,
    playerSectionProps,
    callSidebarProps,
    activitySidebarProps,
    videoPreviewModalProps,
    isPlaylistPanelOpen: playback.playlist.isPlaylistPanelOpen,
    playlistPanelProps,
    addToPlaylistModalProps,
    addVideosToPlaylistModalProps,
  });
}
