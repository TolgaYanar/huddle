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
    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
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
            className="flex-1 bg-transparent text-sm text-slate-100 placeholder:text-slate-500 outline-none min-w-0"
          />
          <button
            type="button"
            onClick={commit}
            disabled={!draft.trim()}
            className="text-xs text-indigo-400 hover:text-indigo-300 font-medium disabled:opacity-40 shrink-0"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-xs text-slate-500 hover:text-slate-300 shrink-0"
          >
            ✕
          </button>
        </>
      ) : (
        <>
          <span className="text-xs text-slate-400 shrink-0">You</span>
          <span className="flex-1 text-sm font-medium text-slate-200 truncate min-w-0">
            {guestUsername || (
              <span className="text-slate-500 font-normal">Set your name…</span>
            )}
          </span>
          <button
            type="button"
            onClick={startEdit}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors shrink-0"
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

export function CallSidebar(props: CallSidebarProps) {
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

        {isCallCollapsed ? (
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${micEnabled ? "bg-sky-400" : "bg-slate-600"}`} title={micEnabled ? "Mic on" : "Mic off"} />
            <span className={`w-2 h-2 rounded-full ${camEnabled ? "bg-indigo-400" : "bg-slate-600"}`} title={camEnabled ? "Camera on" : "Camera off"} />
            <span className={`w-2 h-2 rounded-full ${screenEnabled ? "bg-rose-400" : "bg-slate-600"}`} title={screenEnabled ? "Screen sharing" : "Screen off"} />
            <span className="text-xs text-slate-500">
              {[remoteStreams.length + 1, participantsWithoutStream.length].reduce((a, b) => a + b, 0)}{" "}
              {remoteStreams.length + 1 + participantsWithoutStream.length === 1 ? "person" : "people"}
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
      </div>
    </aside>
  );
}
