import React from "react";

import type { WebRTCMediaState } from "shared-logic";

import type { PeerConnectionStatus } from "../../hooks";

export function ConnectionStatusNotice({
  userId,
  participants,
  peerConnectionStates,
  localMediaExpected,
  remoteMedia,
  getDisplayName,
  retryFailedPeers,
}: {
  userId: string;
  participants: string[];
  peerConnectionStates: Record<string, PeerConnectionStatus>;
  localMediaExpected: boolean;
  remoteMedia: Record<string, WebRTCMediaState>;
  getDisplayName: (id: string) => string;
  retryFailedPeers: () => Promise<void>;
}) {
  const relevant = participants.filter((id) => {
    if (!id || id === userId) return false;
    const media = remoteMedia[id];
    return (
      localMediaExpected || Boolean(media?.mic || media?.cam || media?.screen)
    );
  });
  const failed = relevant.filter((id) => peerConnectionStates[id] === "failed");
  const recovering = relevant.filter((id) => {
    const status = peerConnectionStates[id];
    return status === "connecting" || status === "recovering";
  });

  if (failed.length === 0 && recovering.length === 0) return null;

  if (failed.length > 0) {
    const names = failed.slice(0, 2).map(getDisplayName).join(", ");
    const suffix = failed.length > 2 ? ` and ${failed.length - 2} more` : "";
    return (
      <div
        role="alert"
        className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-negative bg-negative-soft px-3 py-2.5"
      >
        <div>
          <p className="text-xs font-medium text-negative">
            Call media couldn’t connect
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-ink-muted">
            You and {names}
            {suffix} may not be able to hear or see each other.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void retryFailedPeers()}
          className="h-8 self-start rounded-[var(--radius-control)] border border-negative px-3 text-xs font-medium text-negative hover:bg-surface"
        >
          Retry call
        </button>
      </div>
    );
  }

  return (
    <div
      role="status"
      className="rounded-[var(--radius-control)] border border-hairline bg-sunken px-3 py-2 text-xs text-ink-muted"
    >
      {recovering.some((id) => peerConnectionStates[id] === "recovering")
        ? "Restoring"
        : "Connecting"}{" "}
      call media with {recovering.map(getDisplayName).join(", ")}…
    </div>
  );
}
