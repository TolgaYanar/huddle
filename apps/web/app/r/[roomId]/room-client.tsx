"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRoom, WebRTCMediaState } from "shared-logic";

// Components
import { CallSidebar } from "./components/CallSidebar";
import { ActivitySidebar } from "./components/ActivitySidebar";
import { PlayerSection } from "./components/PlayerSection";
import { WheelPickerModal } from "./components/WheelPickerModal";
import { PasswordModal } from "./components/PasswordModal";
import { VideoPreviewModal } from "./components/VideoPreviewModal";
import { RoomHeader } from "./components/RoomHeader";
import { RoomAccessError } from "./components/RoomAccessError";

// Hooks
import {
  useRoomState,
  useMediaTracks,
  useActivityLog,
  useWheelPicker,
  useVideoPlayer,
  useFullscreen,
  useStagePinning,
  usePushToTalkBinding,
  useWebRTCPeers,
} from "./hooks";

// Utils
import { capitalize } from "./lib/activity";
import {
  getKickEmbedSrc,
  getTwitchEmbedSrc,
  isPrimeVideoUrl,
  isProblematicYoutubeUrl,
} from "./lib/video";

// Types
import type { RemoteStreamEntry } from "./types";

export default function RoomClient({ roomId }: { roomId: string }) {
  const [userId, setUserId] = useState("");
  const [isClient, setIsClient] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isCallCollapsed, setIsCallCollapsed] = useState(false);
  const [isActivityCollapsed, setIsActivityCollapsed] = useState(false);

  const [echoCancellationEnabled, setEchoCancellationEnabled] = useState(true);
  const [noiseSuppressionEnabled, setNoiseSuppressionEnabled] = useState(true);
  const [autoGainControlEnabled, setAutoGainControlEnabled] = useState(true);
  const [pushToTalkEnabled, setPushToTalkEnabled] = useState(false);

  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const [remoteStreams, setRemoteStreams] = useState<RemoteStreamEntry[]>([]);
  const [remoteSpeaking, setRemoteSpeaking] = useState<Record<string, boolean>>(
    {}
  );
  const [remoteMedia, setRemoteMedia] = useState<
    Record<string, WebRTCMediaState>
  >({});

  // Refs to break circular dependency between hooks
  const ensureLocalStreamRef = useRef<(() => MediaStream | null) | null>(null);
  const renegotiateAllPeersRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Initialize the room socket connection
  const {
    isConnected,
    joinRoom,
    setRoomPassword,
    requestWheelState,
    addWheelEntry,
    removeWheelEntry,
    clearWheelEntries,
    spinWheel,
    onWheelState,
    onWheelSpun,
    sendSyncEvent,
    onSyncEvent,
    onRoomState,
    requestRoomState,
    sendChatMessage,
    onChatMessage,
    onChatHistory,
    requestChatHistory,
    onActivityEvent,
    onActivityHistory,
    requestActivityHistory,
    onRoomUsers,
    onRoomPasswordStatus,
    onRoomPasswordRequired,
    onUserJoined,
    onUserLeft,
    sendWebRTCOffer,
    sendWebRTCAnswer,
    sendWebRTCIce,
    onWebRTCOffer,
    onWebRTCAnswer,
    onWebRTCIce,
    sendWebRTCMediaState,
    onWebRTCMediaState,
    sendWebRTCSpeaking,
    onWebRTCSpeaking,
    socket,
  } = useRoom(roomId, userId);

  // Sync userId with socket.id when connected
  useEffect(() => {
    if (isConnected && socket?.id) {
      setUserId(socket.id);
    }
  }, [isConnected, socket]);

  // Push-to-talk binding
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
    micEnabled: true, // Will be updated by useMediaTracks
  });

  // Room state management
  const {
    hostId,
    participants,
    roomAccessError,
    hasRoomPassword,
    passwordRequired,
    passwordInput,
    setPasswordInput,
    passwordError,
    submitRoomPassword,
    kickUser,
  } = useRoomState({
    roomId,
    userId,
    socket,
    onRoomUsers,
    onUserJoined,
    onUserLeft,
    onRoomPasswordStatus,
    onRoomPasswordRequired,
    joinRoom,
  });

  // WebRTC peers
  const { closeAllPeers, renegotiateAllPeers } =
    useWebRTCPeers<WebRTCMediaState>({
      isConnected,
      userId,
      roomId,
      ensureLocalStream: () => ensureLocalStreamRef.current?.() ?? null,
      peersRef,
      remoteStreamsRef,
      setRemoteStreams,
      setRemoteMedia,
      setRemoteSpeaking,
      sendWebRTCIce,
      sendWebRTCOffer,
      sendWebRTCAnswer,
      onRoomUsers,
      onUserJoined,
      onUserLeft,
      onWebRTCOffer,
      onWebRTCAnswer,
      onWebRTCIce,
      onWebRTCMediaState,
      onWebRTCSpeaking,
    });

  // Store in ref for use in useMediaTracks
  useEffect(() => {
    renegotiateAllPeersRef.current = renegotiateAllPeers;
  }, [renegotiateAllPeers]);

  // Media tracks management
  const {
    localVideoRef,
    camTrackRef,
    micEnabled,
    setMicEnabled,
    camEnabled,
    setCamEnabled,
    screenEnabled,
    setScreenEnabled,
    localSpeaking,
    ensureLocalStream,
    disableMic,
    disableCam,
    disableScreen,
  } = useMediaTracks({
    isClient,
    isConnected,
    userId,
    echoCancellationEnabled,
    noiseSuppressionEnabled,
    autoGainControlEnabled,
    pushToTalkEnabled,
    pushToTalkDownRef,
    sendWebRTCMediaState,
    sendWebRTCSpeaking,
    renegotiateAllPeers: () =>
      renegotiateAllPeersRef.current?.() ?? Promise.resolve(),
  });

  // Store in ref for use in useWebRTCPeers
  useEffect(() => {
    ensureLocalStreamRef.current = ensureLocalStream;
  }, [ensureLocalStream]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      closeAllPeers();
      disableScreen();
      disableCam(true);
      disableMic(true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeAllPeers]);

  // Renegotiate when connected
  useEffect(() => {
    if (!isConnected) return;
    renegotiateAllPeers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  // Video player state
  const {
    url,
    setUrl,
    inputUrl,
    setInputUrl,
    videoState,
    setVideoState,
    muted,
    volume,
    playbackRate,
    currentTime,
    duration,
    playerReady,
    setPlayerReady,
    playerError,
    setPlayerError,
    isBuffering,
    setIsBuffering,
    videoPreview,
    showPreviewModal,
    isPreviewLoading,
    playerRef,
    loadTimeoutRef,
    normalizedUrl,
    handlePlay,
    handlePause,
    handleSeekTo,
    handleVolumeChange,
    handlePlaybackRateChange,
    handleProgress,
    handleDuration,
    toggleMute,
    handleUrlChange,
    loadVideoUrl,
    handlePlayerError,
    closePreviewModal,
  } = useVideoPlayer({
    isClient,
    roomId,
    sendSyncEvent,
    // addLogEntry will be passed after useActivityLog initializes
  });

  // Activity log and chat
  const {
    logs,
    logsEndRef,
    chatText,
    setChatText,
    handleSendChat,
    // addLogEntry is available if needed elsewhere
  } = useActivityLog({
    roomId,
    userId,
    isConnected,
    playerRef,
    setUrl,
    setInputUrl,
    setVideoState,
    setPlayerReady,
    setPlayerError,
    onSyncEvent,
    onRoomState,
    onChatHistory,
    onChatMessage,
    onActivityHistory,
    onActivityEvent,
    requestRoomState,
    requestChatHistory,
    requestActivityHistory,
    sendChatMessage,
  });

  // Wheel picker
  const { wheelEntries, wheelLastSpin, isWheelOpen, setIsWheelOpen } =
    useWheelPicker({
      roomId,
      onWheelState,
      onWheelSpun,
      requestWheelState,
      addWheelEntry,
      removeWheelEntry,
      clearWheelEntries,
      spinWheel,
    });

  // Fullscreen handling
  const {
    playerContainerRef,
    screenStageContainerRef,
    isPlayerFullscreen,
    isScreenFullscreen,
    fullscreenChatOpen,
    setFullscreenChatOpen,
    togglePlayerFullscreen,
    toggleScreenFullscreen,
  } = useFullscreen({ isClient });

  // Stage pinning
  const {
    // pinnedStage is used internally by stageViewForPlayer
    setPinnedStage,
    isStageDragOver,
    setIsStageDragOver,
    isDraggingTile,
    setIsDraggingTile,
    stageViewForPlayer,
    onUnpinStage,
  } = useStagePinning({
    userId,
    ensureLocalStream,
    remoteStreams,
  });

  // Computed values
  const inviteLink = useMemo(() => {
    if (!isClient) return "";
    return `${window.location.origin}/r/${encodeURIComponent(roomId)}`;
  }, [isClient, roomId]);

  const embedParent = isClient ? window.location.hostname : "localhost";
  const twitchEmbedSrc = getTwitchEmbedSrc(normalizedUrl, embedParent);
  const isTwitch = twitchEmbedSrc !== null;
  const kickEmbedSrc = getKickEmbedSrc(normalizedUrl);
  const isKick = kickEmbedSrc !== null;
  const isPrime = isPrimeVideoUrl(normalizedUrl);
  const isBadYoutubeUrl = isProblematicYoutubeUrl(url);
  const canPlay =
    ((!isBadYoutubeUrl && normalizedUrl.length > 0) || isKick || isTwitch) &&
    !isPrime;
  const canControlPlayback = !isKick && !isTwitch && !isPrime;

  const remotesForPlayer = useMemo(() => {
    return remoteStreams.map((s) => ({
      id: s.id,
      stream: s.stream,
      media: remoteMedia[s.id],
    }));
  }, [remoteStreams, remoteMedia]);

  const fullscreenChatMessages = useMemo(() => {
    return logs.filter((l) => l.type === "chat").slice(-30);
  }, [logs]);

  const copyInvite = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // no-op
    }
  };

  // Show access error if needed
  if (roomAccessError) {
    return <RoomAccessError error={roomAccessError} />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-linear-to-b from-slate-900 via-slate-950 to-black text-slate-200">
      <RoomHeader
        roomId={roomId}
        isConnected={isConnected}
        hasRoomPassword={hasRoomPassword}
        passwordRequired={passwordRequired}
        inviteLink={inviteLink}
        copied={copied}
        onCopyInvite={copyInvite}
        onOpenWheel={() => setIsWheelOpen(true)}
      />

      <PasswordModal
        passwordRequired={passwordRequired}
        passwordInput={passwordInput}
        setPasswordInput={setPasswordInput}
        passwordError={passwordError}
        submitRoomPassword={submitRoomPassword}
      />

      <WheelPickerModal
        open={isWheelOpen && !passwordRequired}
        onClose={() => setIsWheelOpen(false)}
        isConnected={isConnected}
        entries={wheelEntries}
        lastSpin={wheelLastSpin}
        onAddEntry={(text) => addWheelEntry?.(text)}
        onRemoveEntry={(idx) => removeWheelEntry?.(idx)}
        onClear={() => clearWheelEntries?.()}
        onSpin={() => spinWheel?.()}
      />

      <main
        className={`flex-1 grid grid-cols-1 ${
          isActivityCollapsed
            ? "lg:grid-cols-[280px_minmax(0,1fr)]"
            : "lg:grid-cols-[280px_minmax(0,1fr)_320px]"
        } gap-4 px-6 lg:px-8 2xl:px-12 py-6 max-w-screen-2xl 2xl:max-w-none mx-auto w-full`}
      >
        <PlayerSection
          inputUrl={inputUrl}
          setInputUrl={setInputUrl}
          handleUrlChange={handleUrlChange}
          playerContainerRef={playerContainerRef}
          togglePlayerFullscreen={togglePlayerFullscreen}
          isPlayerFullscreen={isPlayerFullscreen}
          isDraggingTile={isDraggingTile}
          setIsDraggingTile={setIsDraggingTile}
          isStageDragOver={isStageDragOver}
          setIsStageDragOver={setIsStageDragOver}
          setPinnedStage={setPinnedStage}
          stageView={stageViewForPlayer}
          screenStageContainerRef={screenStageContainerRef}
          toggleScreenFullscreen={toggleScreenFullscreen}
          isScreenFullscreen={isScreenFullscreen}
          onUnpinStage={onUnpinStage}
          localCamTrack={camTrackRef.current}
          remotes={remotesForPlayer}
          setCamEnabled={setCamEnabled}
          isClient={isClient}
          isKick={isKick}
          isTwitch={isTwitch}
          isPrime={isPrime}
          isBadYoutubeUrl={isBadYoutubeUrl}
          normalizedUrl={normalizedUrl}
          kickEmbedSrc={kickEmbedSrc}
          twitchEmbedSrc={twitchEmbedSrc}
          canPlay={canPlay}
          playerReady={playerReady}
          setPlayerReady={setPlayerReady}
          playerError={playerError}
          setPlayerError={setPlayerError}
          isBuffering={isBuffering}
          setIsBuffering={setIsBuffering}
          loadTimeoutRef={loadTimeoutRef}
          playerRef={playerRef}
          handlePlayerError={handlePlayerError}
          muted={muted}
          volume={volume}
          playbackRate={playbackRate}
          currentTime={currentTime}
          duration={duration}
          canControlPlayback={canControlPlayback}
          isConnected={isConnected}
          videoState={videoState}
          handlePlay={handlePlay}
          handlePause={handlePause}
          handleSeekTo={handleSeekTo}
          handleVolumeChange={handleVolumeChange}
          handlePlaybackRateChange={handlePlaybackRateChange}
          toggleMute={toggleMute}
          handleProgress={handleProgress}
          handleDuration={handleDuration}
          fullscreenChatOpen={fullscreenChatOpen}
          setFullscreenChatOpen={setFullscreenChatOpen}
          fullscreenChatMessages={fullscreenChatMessages}
          chatText={chatText}
          setChatText={setChatText}
          handleSendChat={handleSendChat}
        />

        <CallSidebar
          userId={userId}
          hostId={hostId}
          onKickUser={kickUser}
          participants={participants}
          hasRoomPassword={hasRoomPassword}
          onSetRoomPassword={setRoomPassword}
          localSpeaking={localSpeaking}
          isCallCollapsed={isCallCollapsed}
          setIsCallCollapsed={setIsCallCollapsed}
          micEnabled={micEnabled}
          setMicEnabled={setMicEnabled}
          camEnabled={camEnabled}
          setCamEnabled={setCamEnabled}
          screenEnabled={screenEnabled}
          setScreenEnabled={setScreenEnabled}
          pushToTalkEnabled={pushToTalkEnabled}
          setPushToTalkEnabled={setPushToTalkEnabled}
          pushToTalkDown={pushToTalkDown}
          pushToTalkBindingLabel={pushToTalkBindingLabel}
          stopPushToTalkTransmit={stopPushToTalkTransmit}
          isRebindingPushToTalkKey={isRebindingPushToTalkKey}
          setIsRebindingPushToTalkKey={setIsRebindingPushToTalkKey}
          echoCancellationEnabled={echoCancellationEnabled}
          setEchoCancellationEnabled={setEchoCancellationEnabled}
          noiseSuppressionEnabled={noiseSuppressionEnabled}
          setNoiseSuppressionEnabled={setNoiseSuppressionEnabled}
          autoGainControlEnabled={autoGainControlEnabled}
          setAutoGainControlEnabled={setAutoGainControlEnabled}
          localVideoRef={localVideoRef}
          remoteStreams={remoteStreams}
          remoteSpeaking={remoteSpeaking}
          remoteMedia={remoteMedia}
          setIsDraggingTile={setIsDraggingTile}
          setIsStageDragOver={setIsStageDragOver}
        />

        <ActivitySidebar
          roomId={roomId}
          isConnected={isConnected}
          isActivityCollapsed={isActivityCollapsed}
          setIsActivityCollapsed={setIsActivityCollapsed}
          logs={logs}
          logsEndRef={logsEndRef}
          capitalize={capitalize}
          chatText={chatText}
          setChatText={setChatText}
          handleSendChat={handleSendChat}
        />
      </main>

      <VideoPreviewModal
        showPreviewModal={showPreviewModal}
        videoPreview={videoPreview}
        isPreviewLoading={isPreviewLoading}
        onLoadVideo={loadVideoUrl}
        onClose={closePreviewModal}
      />
    </div>
  );
}
