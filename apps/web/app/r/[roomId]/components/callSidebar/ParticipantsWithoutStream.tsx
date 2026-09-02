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
    <div className="mt-3 rounded-[var(--radius-panel)] border border-hairline bg-sunken p-3">
      <div className="text-xs text-ink-muted font-medium">
        In room · no stream
      </div>
      <div className="mt-2 flex flex-col gap-2">
        {participantsWithoutStream.map((id) => {
          const media = remoteMedia[id];
          return (
            <div
              key={id}
              className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] border border-hairline bg-surface px-3 py-2"
            >
              <div className="min-w-0">
                <div className="text-sm text-ink truncate">
                  {getDisplayName(id)}
                </div>
                <div className="text-[11px] text-ink-muted mt-0.5">
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
                  className="h-8 px-3 inline-flex items-center justify-center rounded-[var(--radius-control)] border border-hairline-strong bg-sunken text-ink text-xs font-medium hover:bg-raised transition-colors"
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
