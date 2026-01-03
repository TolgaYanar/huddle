import React from "react";

import { RemoteTile } from "./RemoteTile";
import { TILE_DND_MIME, type DraggedTilePayload } from "../lib/dnd";
import type { WebRTCMediaState } from "shared-logic";

export function CallSidebar(props: {
  userId: string;
  hostId: string | null;
  onKickUser: (targetId: string) => void;
  participants: string[];
  usernamesById?: Record<string, string | null>;
  hasRoomPassword: boolean;
  onSetRoomPassword: (password: string) => void;

  localSpeaking: boolean;
  isCallCollapsed: boolean;
  setIsCallCollapsed: React.Dispatch<React.SetStateAction<boolean>>;

  micEnabled: boolean;
  setMicEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  camEnabled: boolean;
  setCamEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  screenEnabled: boolean;
  setScreenEnabled: React.Dispatch<React.SetStateAction<boolean>>;

  pushToTalkEnabled: boolean;
  setPushToTalkEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  pushToTalkDown: boolean;
  pushToTalkBindingLabel: string;
  stopPushToTalkTransmit: () => void;

  isRebindingPushToTalkKey: boolean;
  setIsRebindingPushToTalkKey: React.Dispatch<React.SetStateAction<boolean>>;

  echoCancellationEnabled: boolean;
  setEchoCancellationEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  noiseSuppressionEnabled: boolean;
  setNoiseSuppressionEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  autoGainControlEnabled: boolean;
  setAutoGainControlEnabled: React.Dispatch<React.SetStateAction<boolean>>;

  localVideoRef: React.RefObject<HTMLVideoElement | null>;

  remoteStreams: Array<{ id: string; stream: MediaStream }>;
  remoteSpeaking: Record<string, boolean>;
  remoteMedia: Record<string, WebRTCMediaState>;

  setIsDraggingTile: (v: boolean) => void;
  setIsStageDragOver: (v: boolean) => void;
}) {
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
    (id) => id && id !== userId && !remoteStreamIds.has(id)
  );

  const getDisplayName = React.useCallback(
    (id: string) => usernamesById?.[id] ?? id.slice(0, 6),
    [usernamesById]
  );

  return (
    <aside className="backdrop-blur-md bg-white/5 rounded-2xl border border-white/10 p-4 sm:p-5 lg:col-start-1 lg:row-start-1">
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="font-semibold text-slate-50">Call</div>
            <div className="text-xs text-slate-400 mt-1">
              Screen share, webcam, and mic between users.
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span
              className={`px-2 py-1 rounded-full border border-white/10 ${
                localSpeaking
                  ? "bg-emerald-500/15 text-emerald-200"
                  : "bg-black/20 text-slate-300"
              }`}
            >
              {localSpeaking ? "Speaking" : "Silent"}
            </span>

            <button
              type="button"
              onClick={() => setIsCallCollapsed((v) => !v)}
              className="h-8 px-3 rounded-lg border border-white/10 bg-white/5 text-slate-200 text-xs font-medium hover:bg-white/10 transition-colors"
              title={isCallCollapsed ? "Expand call" : "Collapse call"}
            >
              {isCallCollapsed ? "Expand" : "Collapse"}
            </button>
          </div>
        </div>

        {!isCallCollapsed && (
          <>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-slate-100 font-medium">
                  Room password
                </div>
                <div className="text-xs text-slate-300">
                  {hasRoomPassword ? "On" : "Off"}
                </div>
              </div>

              {isHost && (
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowPasswordEditor((v) => !v)}
                    className="h-8 px-3 rounded-lg border border-white/10 bg-white/5 text-slate-200 text-xs font-medium hover:bg-white/10 transition-colors"
                  >
                    {showPasswordEditor
                      ? "Close"
                      : hasRoomPassword
                        ? "Change"
                        : "Set"}
                  </button>
                  {hasRoomPassword && (
                    <button
                      type="button"
                      onClick={() => {
                        onSetRoomPassword("");
                        setPasswordDraft("");
                      }}
                      className="h-8 px-3 rounded-lg border border-white/10 bg-white/5 text-slate-200 text-xs font-medium hover:bg-white/10 transition-colors"
                      title="Clear room password"
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}

              {isHost && showPasswordEditor && (
                <div className="mt-3 flex items-center gap-2">
                  <input
                    value={passwordDraft}
                    onChange={(e) => setPasswordDraft(e.target.value)}
                    placeholder={
                      hasRoomPassword ? "New password" : "Set a password"
                    }
                    type="password"
                    className="h-9 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-white/10"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      onSetRoomPassword(passwordDraft.trim());
                      setPasswordDraft("");
                      setShowPasswordEditor(false);
                    }}
                    className="h-9 px-4 rounded-xl border border-white/10 bg-white/5 text-slate-100 text-sm font-medium hover:bg-white/10 transition-colors"
                    disabled={!passwordDraft.trim()}
                  >
                    Save
                  </button>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setMicEnabled((v) => !v)}
                className={`h-9 px-3 rounded-xl border border-white/10 text-sm font-medium transition-colors ${
                  micEnabled
                    ? "bg-sky-500/15 text-sky-200"
                    : "bg-white/5 text-slate-200 hover:bg-white/10"
                }`}
              >
                {micEnabled ? "🎙 Mic on" : "🎙 Mic"}
              </button>
              <button
                type="button"
                onClick={() => setCamEnabled((v) => !v)}
                className={`h-9 px-3 rounded-xl border border-white/10 text-sm font-medium transition-colors ${
                  camEnabled
                    ? "bg-indigo-500/15 text-indigo-200"
                    : "bg-white/5 text-slate-200 hover:bg-white/10"
                }`}
              >
                {camEnabled ? "📷 Webcam on" : "📷 Webcam"}
              </button>
              <button
                type="button"
                onClick={() => setScreenEnabled((v) => !v)}
                className={`h-9 px-3 rounded-xl border border-white/10 text-sm font-medium transition-colors ${
                  screenEnabled
                    ? "bg-rose-500/15 text-rose-200"
                    : "bg-white/5 text-slate-200 hover:bg-white/10"
                }`}
              >
                {screenEnabled ? "🖥 Sharing" : "🖥 Share screen"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setPushToTalkEnabled((v) => !v);
                  stopPushToTalkTransmit();
                }}
                disabled={!micEnabled}
                className={`h-9 px-3 rounded-xl border border-white/10 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  pushToTalkEnabled
                    ? "bg-amber-500/15 text-amber-200"
                    : "bg-white/5 text-slate-200 hover:bg-white/10"
                }`}
                title={
                  micEnabled
                    ? `Hold ${pushToTalkBindingLabel} to transmit`
                    : "Enable mic first"
                }
              >
                {pushToTalkEnabled
                  ? pushToTalkDown
                    ? `␣ Push-to-talk (${pushToTalkBindingLabel})`
                    : `␣ Push-to-talk on (${pushToTalkBindingLabel})`
                  : `␣ Push-to-talk (${pushToTalkBindingLabel})`}
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsRebindingPushToTalkKey((v) => !v);
                }}
                disabled={!pushToTalkEnabled}
                className={`h-9 px-3 rounded-xl border border-white/10 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  isRebindingPushToTalkKey
                    ? "bg-amber-500/15 text-amber-200"
                    : "bg-white/5 text-slate-200 hover:bg-white/10"
                }`}
                title={
                  pushToTalkEnabled
                    ? isRebindingPushToTalkKey
                      ? "Press a key or mouse button (Esc to cancel)"
                      : "Change push-to-talk binding"
                    : "Enable push-to-talk first"
                }
              >
                {isRebindingPushToTalkKey
                  ? "Press a key or mouse…"
                  : `Change bind (${pushToTalkBindingLabel})`}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setEchoCancellationEnabled((v) => !v)}
                className={`h-9 px-3 rounded-xl border border-white/10 text-sm font-medium transition-colors ${
                  echoCancellationEnabled
                    ? "bg-white/5 text-slate-200 hover:bg-white/10"
                    : "bg-white/5 text-slate-400 hover:bg-white/10"
                }`}
                title="Echo cancellation (may reduce speaker echo)"
              >
                {echoCancellationEnabled ? "🔁 Echo cancel" : "🔁 Echo off"}
              </button>

              <button
                type="button"
                onClick={() => setNoiseSuppressionEnabled((v) => !v)}
                className={`h-9 px-3 rounded-xl border border-white/10 text-sm font-medium transition-colors ${
                  noiseSuppressionEnabled
                    ? "bg-white/5 text-slate-200 hover:bg-white/10"
                    : "bg-white/5 text-slate-400 hover:bg-white/10"
                }`}
                title="Noise suppression (may reduce background noise)"
              >
                {noiseSuppressionEnabled ? "🧹 Noise suppress" : "🧹 Noise off"}
              </button>

              <button
                type="button"
                onClick={() => setAutoGainControlEnabled((v) => !v)}
                className={`h-9 px-3 rounded-xl border border-white/10 text-sm font-medium transition-colors ${
                  autoGainControlEnabled
                    ? "bg-white/5 text-slate-200 hover:bg-white/10"
                    : "bg-white/5 text-slate-400 hover:bg-white/10"
                }`}
                title="Auto gain control (may normalize mic volume)"
              >
                {autoGainControlEnabled ? "🎚 Auto gain" : "🎚 Gain off"}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
              <div
                className={`rounded-2xl border border-white/10 bg-black/20 overflow-hidden relative ${
                  localSpeaking ? "ring-2 ring-emerald-500/20" : ""
                }`}
                draggable
                onDragStart={(e) => {
                  const payload: DraggedTilePayload = { kind: "local" };
                  setIsDraggingTile(true);
                  e.dataTransfer.effectAllowed = "move";
                  try {
                    e.dataTransfer.setData(
                      TILE_DND_MIME,
                      JSON.stringify(payload)
                    );
                  } catch {
                    // ignore
                  }
                  e.dataTransfer.setData("text/plain", "local");
                }}
                onDragEnd={() => {
                  setIsDraggingTile(false);
                  setIsStageDragOver(false);
                }}
                title="Drag to the main player to pin"
              >
                <div className="absolute top-2 left-2 z-10 flex items-center gap-2">
                  <span className="text-[11px] px-2 py-1 rounded-full bg-black/40 border border-white/10 text-slate-200">
                    You
                  </span>
                  {hostId && userId === hostId && (
                    <span className="text-[11px] px-2 py-1 rounded-full bg-amber-500/15 border border-amber-500/20 text-amber-200">
                      Host
                    </span>
                  )}
                </div>
                <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      try {
                        if (document.fullscreenElement) {
                          void document.exitFullscreen();
                          return;
                        }
                        void localVideoRef.current?.requestFullscreen?.();
                      } catch {
                        // ignore
                      }
                    }}
                    className="h-9 w-9 inline-flex items-center justify-center rounded-xl border border-white/20 bg-black/60 text-slate-50 text-sm hover:bg-white/10 transition-colors"
                    title="Fullscreen"
                  >
                    ⛶
                  </button>
                </div>
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full aspect-video object-cover"
                />
                {!camEnabled && !screenEnabled && (
                  <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm">
                    Camera/screen off
                  </div>
                )}
              </div>

              {remoteStreams.map(({ id, stream }) => {
                const speaking = !!remoteSpeaking[id];
                const media = remoteMedia[id];
                const displayName = getDisplayName(id);
                const label =
                  hostId && id === hostId
                    ? `${displayName} • Host`
                    : displayName;
                return (
                  <RemoteTile
                    key={id}
                    id={id}
                    stream={stream}
                    speaking={speaking}
                    label={label}
                    media={media}
                    extraActions={
                      isHost ? (
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                          }}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onKickUser(id);
                          }}
                          className="h-9 px-3 inline-flex items-center justify-center rounded-xl border border-white/20 bg-black/60 text-slate-50 text-xs font-medium hover:bg-white/10 transition-colors"
                          title="Kick user (host only)"
                        >
                          Kick
                        </button>
                      ) : null
                    }
                    draggablePayload={{ kind: "remote", peerId: id }}
                    onDraggingChange={(v) => {
                      setIsDraggingTile(v);
                      if (!v) setIsStageDragOver(false);
                    }}
                  />
                );
              })}
            </div>

            {participantsWithoutStream.length > 0 && (
              <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3">
                <div className="text-xs text-slate-300 font-medium">
                  Participants (no stream yet)
                </div>
                <div className="mt-2 flex flex-col gap-2">
                  {participantsWithoutStream.map((id) => {
                    const media = remoteMedia[id];
                    return (
                      <div
                        key={id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="text-sm text-slate-100 truncate">
                            {getDisplayName(id)}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            {hostId && id === hostId ? "Host" : ""}
                            {media
                              ? ` ${media.screen ? "🖥" : media.cam ? "📷" : ""}${media.mic ? " 🎙" : ""}`
                              : ""}
                          </div>
                        </div>

                        {isHost ? (
                          <button
                            type="button"
                            onClick={() => onKickUser(id)}
                            className="h-8 px-3 inline-flex items-center justify-center rounded-lg border border-white/20 bg-black/40 text-slate-50 text-xs font-medium hover:bg-white/10 transition-colors"
                            title="Kick user (host only)"
                          >
                            Kick
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
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
