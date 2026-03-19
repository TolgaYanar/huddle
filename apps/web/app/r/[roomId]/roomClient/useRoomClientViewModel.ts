import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRoom } from "shared-logic";
import { useGame } from "../hooks/useGame";
import {
  useFullscreen,
  usePushToTalkBinding,
  useRoomState,
  useStagePinning,
} from "../hooks";
import { apiAuthMe, type AuthUser } from "../../../lib/api";
import type { RoomClientViewProps } from "./RoomClientView";
import { useUnhandledRejectionGuard } from "./useUnhandledRejectionGuard";
import { useGuardedSendSyncEvent } from "./useGuardedSendSyncEvent";
import { useCopyInvite, useInviteLink } from "./useInviteLink";
import { useVideoEmbedInfo } from "./useVideoEmbedInfo";
import { buildPlayerSectionProps } from "./buildPlayerSectionProps";
import { buildPlaylistPanelProps } from "./buildPlaylistPanelProps";
import { buildCallSidebarProps } from "./buildCallSidebarProps";
import { useRoomClientPlayback } from "./useRoomClientPlayback";
import { useRoomClientRtc } from "./useRoomClientRtc";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useTimer } from "../hooks/useTimer";
import { writeRoomHistory } from "../../../lib/roomHistory";

export function useRoomClientViewModel(roomId: string): RoomClientViewProps {
  const [userId, setUserId] = useState("");
  const [isClient, setIsClient] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
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

  useEffect(() => {
    let cancelled = false;
    apiAuthMe()
      .then((r) => { if (!cancelled) setAuthUser(r.user); })
      .catch(() => { if (!cancelled) setAuthUser(null); });
    return () => { cancelled = true; };
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

  // Write room to visit history whenever connected or room name changes.
  useEffect(() => {
    if (!isClient || !room.isConnected) return;
    writeRoomHistory(roomId, roomState.roomName);
  }, [isClient, room.isConnected, roomId, roomState.roomName]);

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
      username: roomState.usernamesById[s.id] ?? null,
    }));
  }, [rtc.remoteStreams, rtc.remoteMedia, roomState.usernamesById]);

  const { timer } = useTimer({ onTimerState: room.onTimerState });

  useKeyboardShortcuts({
    enabled: isClient && !roomState.passwordRequired,
    canControlPlayback: videoEmbed.canControlPlayback,
    isPlaying: playback.video.videoState === "Playing",
    currentTime: playback.video.currentTime,
    volume: playback.video.volume,
    effectiveMuted: playback.video.effectiveMuted,
    handleUserPlay: playback.video.handleUserPlay,
    handleUserPause: playback.video.handleUserPause,
    handleSeekFromController: playback.video.handleSeekFromController,
    handleVolumeFromController: playback.video.handleVolumeFromController,
    toggleLocalMute: playback.video.toggleLocalMute,
    togglePlayerFullscreen: fullscreen.togglePlayerFullscreen,
  });

  const handleOpenAddToPlaylist = useCallback(() => {
    if (playback.video.url) {
      playback.playlist.openAddToPlaylist(playback.video.url);
    }
  }, [playback.playlist, playback.video.url]);

  const [isAddVideosModalOpen, setIsAddVideosModalOpen] = useState(false);
  const [openGameId, setOpenGameId] = useState<string | null>(null);
  const [isRoomSettingsOpen, setIsRoomSettingsOpen] = useState(false);
  const [isTimerOpen, setIsTimerOpen] = useState(false);

  const playerSectionProps = buildPlayerSectionProps({
    isClient,
    isConnected: room.isConnected,
    video: playback.video,
    fullscreen,
    stagePinning,
    mediaTracks: rtc.mediaTracks,
    videoEmbed,
    remotesForPlayer,
    localUsername: authUser?.username ?? null,
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

  const timerWidgetProps = {
    timer,
    onClick: () => setIsTimerOpen(true),
  };

  const headerProps =
    isClient && !roomState.passwordRequired
      ? {
          isConnected: room.isConnected,
          reconnectAttempt: room.reconnectAttempt,
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
          roomName: roomState.roomName,
          isHost: roomState.hostId === userId,
          onSetRoomName: roomState.setRoomName,
          onOpenSettings: () => setIsRoomSettingsOpen(true),
          onOpenTimer: () => setIsTimerOpen(true),
          timerWidgetProps,
          authUser,
          onAuthUserChange: setAuthUser,
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

  const game = useGame({
    onGameState: room.onGameState,
    requestGameState: room.requestGameState,
    createGame: room.createGame,
    addRounds: room.addRounds,
    removeRounds: room.removeRounds,
    startSession: room.startSession,
    submitGuess: room.submitGuess,
    revealHint: room.revealHint,
    skipTurn: room.skipTurn,
    endRound: room.endRound,
    nextRound: room.nextRound,
    endSession: room.endSession,
    resetGame: room.resetGame,
    mySocketId: room.socket?.id || userId,
  });

  const gameProps = {
    gameState: game.gameState,
    mySocketId: room.socket?.id || userId,
    isRoomHost: roomState.hostId === userId,
    createGame: game.createGame,
    addRounds: game.addRounds,
    removeRounds: game.removeRounds,
    startSession: game.startSession,
    submitGuess: game.submitGuess,
    revealHint: game.revealHint,
    skipTurn: game.skipTurn,
    endRound: game.endRound,
    nextRound: game.nextRound,
    endSession: game.endSession,
    resetGame: game.resetGame,
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
    gameProps,
    onOpenGame: setOpenGameId,
  };

  const gameModalProps = {
    openGameId,
    onClose: () => setOpenGameId(null),
    gameProps,
  };

  const reconnectBannerProps = {
    isConnected: room.isConnected,
    reconnectAttempt: room.reconnectAttempt,
    reconnectFailed: room.reconnectFailed,
    onManualReconnect: room.manualReconnect,
  };

  const timerModalProps = {
    open: isTimerOpen,
    onClose: () => setIsTimerOpen(false),
    timer,
    onSetDuration: room.timerSetDuration,
    onStart: room.timerStart,
    onPause: room.timerPause,
    onReset: room.timerReset,
    isConnected: room.isConnected,
  };

  const roomSettingsPanelProps = {
    isOpen: isRoomSettingsOpen,
    onClose: () => setIsRoomSettingsOpen(false),
    roomName: roomState.roomName,
    onSetRoomName: roomState.setRoomName,
    hasRoomPassword: roomState.hasRoomPassword,
    onSetRoomPassword: (pw: string) => room.setRoomPassword?.(pw),
    participants: roomState.participants,
    usernamesById: roomState.usernamesById,
    userId,
    hostId: roomState.hostId,
    onKickUser: roomState.kickUser,
    onTransferHost: roomState.transferHost,
  };

  return {
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
    gameModalProps,
    reconnectBannerProps,
    roomSettingsPanelProps,
    timerModalProps,
  };
}
