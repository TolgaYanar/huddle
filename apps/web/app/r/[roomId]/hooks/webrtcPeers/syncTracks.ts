async function replaceOrRecreateSender(args: {
  pc: RTCPeerConnection;
  sender: RTCRtpSender;
  track: MediaStreamTrack;
  stream: MediaStream;
}) {
  const { pc, sender, track, stream } = args;
  try {
    await sender.replaceTrack(track);
    return sender;
  } catch (replaceError) {
    // replaceTrack can reject when a browser cannot switch the encoder in
    // place (for example after a camera changes resolution). Leaving that
    // rejection unobserved keeps the old, often ended, track attached while
    // the UI claims the new device is live. Recreate the sender instead; the
    // caller's following offer negotiates the new sender with the peer.
    try {
      pc.removeTrack(sender);
      return pc.addTrack(track, stream);
    } catch (recreateError) {
      throw new AggregateError(
        [replaceError, recreateError],
        `Failed to attach ${track.kind} track to WebRTC peer`,
      );
    }
  }
}

export async function syncTracksToPeer(
  ensureLocalStream: () => MediaStream | null,
  pc: RTCPeerConnection,
) {
  const localStream = ensureLocalStream();
  if (!localStream) return;

  // Skip tracks that have already ended (e.g. screen share stopped by the
  // browser before React state cleanup has run).
  const localTracks = localStream
    .getTracks()
    .filter((track) => track.readyState !== "ended");
  const localTrackIds = new Set(localTracks.map((track) => track.id));
  const originalSenders = pc.getSenders();
  const claimedSenders = new Set<RTCRtpSender>();
  const tracksNeedingSender: MediaStreamTrack[] = [];

  // Preserve exact track/sender matches first. This matters when camera and
  // screen sharing are both video tracks: matching merely by kind causes one
  // to replace the other and silently drops a source.
  for (const track of localTracks) {
    const exact = originalSenders.find(
      (sender) => !claimedSenders.has(sender) && sender.track?.id === track.id,
    );
    if (exact) claimedSenders.add(exact);
    else tracksNeedingSender.push(track);
  }

  for (const track of tracksNeedingSender) {
    // Reuse only a stale sender of the same kind. An active same-kind sender
    // belongs to another source (camera vs screen) and must remain untouched.
    const reusable = originalSenders.find(
      (sender) =>
        !claimedSenders.has(sender) &&
        sender.track?.kind === track.kind &&
        !localTrackIds.has(sender.track.id),
    );

    if (reusable) {
      const sender = await replaceOrRecreateSender({
        pc,
        sender: reusable,
        track,
        stream: localStream,
      });
      // If replacement fell back to removeTrack + addTrack, the original
      // sender has already been removed and must not be removed a second time
      // in the stale-sender sweep below.
      claimedSenders.add(reusable);
      claimedSenders.add(sender);
    } else {
      claimedSenders.add(pc.addTrack(track, localStream));
    }
  }

  // Remove original senders that no longer represent a live local track and
  // were not repurposed above.
  for (const sender of originalSenders) {
    if (claimedSenders.has(sender)) continue;
    const track = sender.track;
    if (track && localTrackIds.has(track.id)) continue;
    pc.removeTrack(sender);
  }
}
