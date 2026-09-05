import React, { useState } from "react";

import type { CallSidebarProps } from "./types";

function GuestNameEditor({
  guestUsername,
  setGuestUsername,
}: {
  guestUsername: string;
  setGuestUsername: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const startEdit = () => {
    setDraft(guestUsername);
    setEditing(true);
  };

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed) setGuestUsername(trimmed);
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-2 rounded-[var(--radius-control)] border border-hairline bg-sunken px-3 py-2">
      {editing ? (
        <>
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") setEditing(false);
            }}
            maxLength={30}
            placeholder="Your display name"
            className="flex-1 bg-transparent text-sm text-ink placeholder:text-ink-faint outline-none min-w-0"
          />
          <button
            type="button"
            onClick={commit}
            disabled={!draft.trim()}
            className="text-xs text-accent hover:brightness-110 font-medium disabled:opacity-40 shrink-0"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-xs text-ink-faint hover:text-ink-muted shrink-0"
          >
            ✕
          </button>
        </>
      ) : (
        <>
          <span className="text-xs text-ink-muted shrink-0">You</span>
          <span className="flex-1 text-sm font-medium text-ink truncate min-w-0">
            {guestUsername || (
              <span className="text-ink-faint font-normal">Set your name…</span>
            )}
          </span>
          <button
            type="button"
            onClick={startEdit}
            className="text-xs text-ink-faint hover:text-ink-muted transition-colors shrink-0"
            title="Edit display name"
          >
            ✎
          </button>
        </>
      )}
    </div>
  );
}
import { CallHeader } from "./CallHeader";
import { DeviceControls } from "./DeviceControls";
import { AudioProcessingControls } from "./AudioProcessingControls";
import { TileGrid } from "./TileGrid";
import { ParticipantsWithoutStream } from "./ParticipantsWithoutStream";
import { ConnectionStatusNotice } from "./ConnectionStatusNotice";

export const CallSidebar = React.memo(function CallSidebar(
  props: CallSidebarProps,
) {
  const {
    userId,
    hostId,
    onKickUser,
    participants,
    usernamesById,
    guestUsername,
    setGuestUsername,
    localSpeaking,
    isCallCollapsed,
    setIsCallCollapsed,
    micEnabled,
    setMicEnabled,
    camEnabled,
    setCamEnabled,
    screenEnabled,
    setScreenEnabled,
    mediaErrors,
    mediaPending,
    clearMediaError,
    audioInputs,
    videoInputs,
    audioOutputs,
    audioInputId,
    setAudioInputId,
    videoInputId,
    setVideoInputId,
    audioOutputId,
    setAudioOutputId,
    outputSelectionSupported,
    devicesRefreshing,
    deviceInventoryError,
    refreshDevices,
    pushToTalkEnabled,
    setPushToTalkEnabled,
    pushToTalkDown,
    pushToTalkBindingLabel,
    stopPushToTalkTransmit,
    closePushToTalkGate,
    isRebindingPushToTalkKey,
    setIsRebindingPushToTalkKey,
    echoCancellationEnabled,
    setEchoCancellationEnabled,
    noiseSuppressionEnabled,
    setNoiseSuppressionEnabled,
    autoGainControlEnabled,
    setAutoGainControlEnabled,
    localVideoRef,
    setLocalVideoElement,
    remoteStreams,
    remoteSpeaking,
    remoteMedia,
    peerConnectionStates,
    retryFailedPeers,
    setIsDraggingTile,
    setIsStageDragOver,
    onPinTile,
  } = props;

  const isHost = Boolean(userId && hostId && userId === hostId);
  const localMediaExpected = micEnabled || camEnabled || screenEnabled;

  const remoteStreamIds = new Set(remoteStreams.map((s) => s.id));
  const participantsWithoutStream = participants.filter(
    (id) => id && id !== userId && !remoteStreamIds.has(id),
  );

  const getDisplayName = React.useCallback(
    (id: string) => usernamesById?.[id] ?? id.slice(0, 6),
    [usernamesById],
  );

  return (
    <aside className="panel p-4 sm:p-5 lg:col-start-1 lg:row-start-1">
      <div className="flex flex-col gap-3">
        <CallHeader
          localSpeaking={localSpeaking}
          micEnabled={micEnabled}
          isCallCollapsed={isCallCollapsed}
          setIsCallCollapsed={setIsCallCollapsed}
        />

        <ConnectionStatusNotice
          userId={userId}
          participants={participants}
          peerConnectionStates={peerConnectionStates}
          localMediaExpected={localMediaExpected}
          remoteMedia={remoteMedia}
          getDisplayName={getDisplayName}
          retryFailedPeers={retryFailedPeers}
        />

        {isCallCollapsed ? (
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${micEnabled ? "bg-accent" : "bg-ink-faint"}`}
              title={micEnabled ? "Mic on" : "Mic off"}
            />
            <span
              className={`w-2 h-2 rounded-full ${camEnabled ? "bg-accent" : "bg-ink-faint"}`}
              title={camEnabled ? "Camera on" : "Camera off"}
            />
            <span
              className={`w-2 h-2 rounded-full ${screenEnabled ? "bg-negative" : "bg-ink-faint"}`}
              title={screenEnabled ? "Screen sharing" : "Screen off"}
            />
            <span className="text-xs text-ink-faint">
              {[
                remoteStreams.length + 1,
                participantsWithoutStream.length,
              ].reduce((a, b) => a + b, 0)}{" "}
              {remoteStreams.length + 1 + participantsWithoutStream.length === 1
                ? "person"
                : "people"}
            </span>
          </div>
        ) : (
          <>
            {guestUsername !== null && setGuestUsername !== null && (
              <GuestNameEditor
                guestUsername={guestUsername}
                setGuestUsername={setGuestUsername}
              />
            )}

            <DeviceControls
              micEnabled={micEnabled}
              setMicEnabled={setMicEnabled}
              camEnabled={camEnabled}
              setCamEnabled={setCamEnabled}
              screenEnabled={screenEnabled}
              setScreenEnabled={setScreenEnabled}
              mediaErrors={mediaErrors}
              mediaPending={mediaPending}
              clearMediaError={clearMediaError}
              audioInputs={audioInputs}
              videoInputs={videoInputs}
              audioOutputs={audioOutputs}
              audioInputId={audioInputId}
              setAudioInputId={setAudioInputId}
              videoInputId={videoInputId}
              setVideoInputId={setVideoInputId}
              audioOutputId={audioOutputId}
              setAudioOutputId={setAudioOutputId}
              outputSelectionSupported={outputSelectionSupported}
              devicesRefreshing={devicesRefreshing}
              deviceInventoryError={deviceInventoryError}
              refreshDevices={refreshDevices}
              pushToTalkEnabled={pushToTalkEnabled}
              setPushToTalkEnabled={setPushToTalkEnabled}
              pushToTalkDown={pushToTalkDown}
              pushToTalkBindingLabel={pushToTalkBindingLabel}
              stopPushToTalkTransmit={stopPushToTalkTransmit}
              closePushToTalkGate={closePushToTalkGate}
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
              setLocalVideoElement={setLocalVideoElement}
              remoteStreams={remoteStreams}
              remoteSpeaking={remoteSpeaking}
              remoteMedia={remoteMedia}
              onKickUser={onKickUser}
              getDisplayName={getDisplayName}
              setIsDraggingTile={setIsDraggingTile}
              setIsStageDragOver={setIsStageDragOver}
              onPinTile={onPinTile}
            />

            <ParticipantsWithoutStream
              participantsWithoutStream={participantsWithoutStream}
              remoteMedia={remoteMedia}
              peerConnectionStates={peerConnectionStates}
              localMediaExpected={localMediaExpected}
              hostId={hostId}
              isHost={isHost}
              getDisplayName={getDisplayName}
              onKickUser={onKickUser}
            />
          </>
        )}
      </div>
    </aside>
  );
});
