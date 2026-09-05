import { describe, expect, it, vi } from "vitest";

import { syncTracksToPeer } from "../syncTracks";

function track(id: string, kind: "audio" | "video") {
  return { id, kind, readyState: "live" } as MediaStreamTrack;
}

function sender(attachedTrack: MediaStreamTrack) {
  return {
    track: attachedTrack,
    replaceTrack: vi.fn(async function (
      this: { track: MediaStreamTrack },
      next,
    ) {
      this.track = next as MediaStreamTrack;
    }),
  } as unknown as RTCRtpSender;
}

function harness(localTracks: MediaStreamTrack[], senders: RTCRtpSender[]) {
  const stream = {
    getTracks: () => localTracks,
  } as unknown as MediaStream;
  const currentSenders = [...senders];
  const addTrack = vi.fn((nextTrack: MediaStreamTrack) => {
    const nextSender = sender(nextTrack);
    currentSenders.push(nextSender);
    return nextSender;
  });
  const removeTrack = vi.fn((removedSender: RTCRtpSender) => {
    const index = currentSenders.indexOf(removedSender);
    if (index >= 0) currentSenders.splice(index, 1);
  });
  const pc = {
    getSenders: () => [...currentSenders],
    addTrack,
    removeTrack,
  } as unknown as RTCPeerConnection;
  return { stream, pc, addTrack, removeTrack };
}

describe("syncTracksToPeer", () => {
  it("keeps camera and screen as separate same-kind senders", async () => {
    const camera = track("camera", "video");
    const screen = track("screen", "video");
    const setup = harness([camera, screen], []);

    await syncTracksToPeer(() => setup.stream, setup.pc);

    expect(setup.addTrack).toHaveBeenCalledTimes(2);
    expect(setup.addTrack).toHaveBeenNthCalledWith(1, camera, setup.stream);
    expect(setup.addTrack).toHaveBeenNthCalledWith(2, screen, setup.stream);
  });

  it("recreates a sender when replaceTrack rejects", async () => {
    const oldTrack = track("old-camera", "video");
    const nextTrack = track("new-camera", "video");
    const oldSender = sender(oldTrack);
    vi.mocked(oldSender.replaceTrack).mockRejectedValueOnce(
      new DOMException("encoder cannot switch", "InvalidModificationError"),
    );
    const setup = harness([nextTrack], [oldSender]);

    await syncTracksToPeer(() => setup.stream, setup.pc);

    expect(oldSender.replaceTrack).toHaveBeenCalledWith(nextTrack);
    expect(setup.removeTrack).toHaveBeenCalledTimes(1);
    expect(setup.removeTrack).toHaveBeenCalledWith(oldSender);
    expect(setup.addTrack).toHaveBeenCalledWith(nextTrack, setup.stream);
  });

  it("removes ended and otherwise absent senders", async () => {
    const live = track("live-mic", "audio");
    const ended = {
      ...track("ended-camera", "video"),
      readyState: "ended",
    } as MediaStreamTrack;
    const liveSender = sender(live);
    const endedSender = sender(ended);
    const setup = harness([live, ended], [liveSender, endedSender]);

    await syncTracksToPeer(() => setup.stream, setup.pc);

    expect(setup.removeTrack).toHaveBeenCalledTimes(1);
    expect(setup.removeTrack).toHaveBeenCalledWith(endedSender);
    expect(setup.addTrack).not.toHaveBeenCalled();
  });
});
