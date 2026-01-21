import React from "react";

import type { WebRTCMediaState } from "shared-logic";

export function ParticipantsWithoutStream(props: {
  participantsWithoutStream: string[];
  remoteMedia: Record<string, WebRTCMediaState>;
  hostId: string | null;
  isHost: boolean;
  getDisplayName: (id: string) => string;
  onKickUser: (targetId: string) => void;
}) {
  const {
    participantsWithoutStream,
    remoteMedia,
    hostId,
    isHost,
    getDisplayName,
    onKickUser,
  } = props;

  if (participantsWithoutStream.length === 0) return null;

  return (
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
  );
}
