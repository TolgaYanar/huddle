type StateSetter<T> = React.Dispatch<React.SetStateAction<Record<string, T>>>;

export function reconcileRoomUsers<MediaState>(args: {
  users: string[];
  currentUserId: string;
  peerIds: string[];
  mediaStates?: Record<string, MediaState>;
  closePeer: (peerId: string) => void;
  clearPendingIce: (peerId: string) => void;
  setRemoteMedia: StateSetter<MediaState>;
  setRemoteSpeaking: StateSetter<boolean>;
}) {
  const activePeerIds = new Set(
    args.users.filter(
      (peerId) => Boolean(peerId) && peerId !== args.currentUserId,
    ),
  );

  for (const peerId of args.peerIds) {
    if (activePeerIds.has(peerId)) continue;
    args.clearPendingIce(peerId);
    args.closePeer(peerId);
  }

  args.setRemoteMedia((previous) => {
    const next: Record<string, MediaState> = {};
    for (const peerId of activePeerIds) {
      if (args.mediaStates && peerId in args.mediaStates) {
        const mediaState = args.mediaStates[peerId];
        if (mediaState !== undefined) next[peerId] = mediaState;
      } else if (peerId in previous) {
        const mediaState = previous[peerId];
        if (mediaState !== undefined) next[peerId] = mediaState;
      }
    }
    return next;
  });

  args.setRemoteSpeaking(() => {
    const next: Record<string, boolean> = {};
    for (const peerId of activePeerIds) {
      // A snapshot begins a new presence epoch. `speaking:false` may have
      // disappeared with the previous socket, so positive state must never be
      // carried across reconnect.
      next[peerId] = false;
    }
    return next;
  });

  return activePeerIds;
}
