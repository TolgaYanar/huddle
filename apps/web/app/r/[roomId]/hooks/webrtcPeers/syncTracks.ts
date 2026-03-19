export function syncTracksToPeer(
  ensureLocalStream: () => MediaStream | null,
  pc: RTCPeerConnection,
) {
  const localStream = ensureLocalStream();
  if (!localStream) return;
  // Skip tracks that have already ended (e.g. screen share stopped by the
  // browser before React state cleanup has run).
  const localTracks = localStream.getTracks().filter(
    (t) => t.readyState !== "ended",
  );

  // Remove senders whose tracks are no longer present.
  for (const sender of pc.getSenders()) {
    const t = sender.track;
    if (!t) continue;
    const stillPresent = localTracks.some((lt) => lt.id === t.id);
    if (!stillPresent) {
      try {
        pc.removeTrack(sender);
      } catch {
        // ignore
      }
    }
  }

  // Add/replace senders for current tracks.
  for (const track of localTracks) {
    const sameKindSenders = pc
      .getSenders()
      .filter((s) => s.track && s.track.kind === track.kind);

    if (track.kind === "audio") {
      const sender = sameKindSenders[0];
      if (!sender) {
        pc.addTrack(track, localStream);
      } else if (sender.track?.id !== track.id) {
        sender.replaceTrack(track).catch(() => {});
      }
    }

    if (track.kind === "video") {
      const sender = sameKindSenders[0];
      if (!sender) {
        pc.addTrack(track, localStream);
      } else if (sender.track?.id !== track.id) {
        sender.replaceTrack(track).catch(() => {});
      }
    }
  }
}
