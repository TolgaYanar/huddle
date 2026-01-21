import React from "react";

import type { CallSidebarProps } from "./types";
import { CallHeader } from "./CallHeader";
import { RoomPasswordCard } from "./RoomPasswordCard";
import { DeviceControls } from "./DeviceControls";
import { AudioProcessingControls } from "./AudioProcessingControls";
import { TileGrid } from "./TileGrid";
import { ParticipantsWithoutStream } from "./ParticipantsWithoutStream";

export function CallSidebar(props: CallSidebarProps) {
  const {
    userId,
    hostId,
    onKickUser,
    participants,
    usernamesById,
    hasRoomPassword,
    onSetRoomPassword,
    localSpeaking,
    isCallCollapsed,
    setIsCallCollapsed,
    micEnabled,
    setMicEnabled,
    camEnabled,
    setCamEnabled,
    screenEnabled,
    setScreenEnabled,
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
    localVideoRef,
    remoteStreams,
    remoteSpeaking,
    remoteMedia,
    setIsDraggingTile,
    setIsStageDragOver,
  } = props;

  const isHost = Boolean(userId && hostId && userId === hostId);
  const [showPasswordEditor, setShowPasswordEditor] = React.useState(false);
  const [passwordDraft, setPasswordDraft] = React.useState("");

  const remoteStreamIds = new Set(remoteStreams.map((s) => s.id));
  const participantsWithoutStream = participants.filter(
    (id) => id && id !== userId && !remoteStreamIds.has(id),
  );

  const getDisplayName = React.useCallback(
    (id: string) => usernamesById?.[id] ?? id.slice(0, 6),
    [usernamesById],
  );

  return (
    <aside className="backdrop-blur-md bg-white/5 rounded-2xl border border-white/10 p-4 sm:p-5 lg:col-start-1 lg:row-start-1">
      <div className="flex flex-col gap-3">
        <CallHeader
          localSpeaking={localSpeaking}
          isCallCollapsed={isCallCollapsed}
          setIsCallCollapsed={setIsCallCollapsed}
        />

        {!isCallCollapsed && (
          <>
            <RoomPasswordCard
              isHost={isHost}
              hasRoomPassword={hasRoomPassword}
              onSetRoomPassword={onSetRoomPassword}
              showPasswordEditor={showPasswordEditor}
              setShowPasswordEditor={setShowPasswordEditor}
              passwordDraft={passwordDraft}
              setPasswordDraft={setPasswordDraft}
            />

            <DeviceControls
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
            />

            <AudioProcessingControls
              echoCancellationEnabled={echoCancellationEnabled}
              setEchoCancellationEnabled={setEchoCancellationEnabled}
              noiseSuppressionEnabled={noiseSuppressionEnabled}
              setNoiseSuppressionEnabled={setNoiseSuppressionEnabled}
              autoGainControlEnabled={autoGainControlEnabled}
              setAutoGainControlEnabled={setAutoGainControlEnabled}
            />

            <TileGrid
              userId={userId}
              hostId={hostId}
              isHost={isHost}
              localSpeaking={localSpeaking}
              camEnabled={camEnabled}
              screenEnabled={screenEnabled}
              localVideoRef={localVideoRef}
              remoteStreams={remoteStreams}
              remoteSpeaking={remoteSpeaking}
              remoteMedia={remoteMedia}
              onKickUser={onKickUser}
              getDisplayName={getDisplayName}
              setIsDraggingTile={setIsDraggingTile}
              setIsStageDragOver={setIsStageDragOver}
            />

            <ParticipantsWithoutStream
              participantsWithoutStream={participantsWithoutStream}
              remoteMedia={remoteMedia}
              hostId={hostId}
              isHost={isHost}
              getDisplayName={getDisplayName}
              onKickUser={onKickUser}
            />
          </>
        )}

        {isCallCollapsed && (
          <div className="text-xs text-slate-400">
            Call is collapsed. Expand to view tiles.
          </div>
        )}
      </div>
    </aside>
  );
}
