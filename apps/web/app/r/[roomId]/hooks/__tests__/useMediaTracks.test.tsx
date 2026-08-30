import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useMediaTracks } from "../useMediaTracks";

class FakeTrack {
  id: string;
  kind: "audio" | "video";
  enabled = true;
  onended: (() => void) | null = null;
  stop = vi.fn();

  constructor(id: string, kind: "audio" | "video") {
    this.id = id;
    this.kind = kind;
  }
}

class FakeStream {
  private tracks: FakeTrack[];

  constructor(tracks: FakeTrack[] = []) {
    this.tracks = [...tracks];
  }

  getTracks() {
    return [...this.tracks];
  }

  getAudioTracks() {
    return this.tracks.filter((track) => track.kind === "audio");
  }

  getVideoTracks() {
    return this.tracks.filter((track) => track.kind === "video");
  }

  addTrack(track: FakeTrack) {
    if (!this.tracks.includes(track)) this.tracks.push(track);
  }

  removeTrack(track: FakeTrack) {
    this.tracks = this.tracks.filter((candidate) => candidate !== track);
  }
}

const mediaStreamDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "MediaStream",
);
const mediaDevicesDescriptor = Object.getOwnPropertyDescriptor(
  navigator,
  "mediaDevices",
);

function renderMediaTracks(options?: { isConnected?: boolean }) {
  return renderHook(
    ({ isConnected }: { isConnected: boolean }) =>
      useMediaTracks({
        isClient: true,
        isConnected,
        userId: "self",
        echoCancellationEnabled: true,
        noiseSuppressionEnabled: true,
        autoGainControlEnabled: true,
        pushToTalkEnabled: false,
        pushToTalkDownRef: { current: false },
        sendWebRTCMediaState: vi.fn(),
        sendWebRTCSpeaking: vi.fn(),
        renegotiateAllPeers: vi.fn().mockResolvedValue(undefined),
      }),
    { initialProps: { isConnected: options?.isConnected ?? false } },
  );
}

describe("useMediaTracks", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "MediaStream", {
      configurable: true,
      value: FakeStream,
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn(),
        getDisplayMedia: vi.fn(),
      },
    });
  });

  afterEach(() => {
    if (mediaStreamDescriptor) {
      Object.defineProperty(globalThis, "MediaStream", mediaStreamDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, "MediaStream");
    }
    if (mediaDevicesDescriptor) {
      Object.defineProperty(navigator, "mediaDevices", mediaDevicesDescriptor);
    } else {
      Reflect.deleteProperty(navigator, "mediaDevices");
    }
  });

  it("stops a camera track that resolves after the user turns camera off", async () => {
    let resolveCamera!: (stream: MediaStream) => void;
    const cameraRequest = new Promise<MediaStream>((resolve) => {
      resolveCamera = resolve;
    });
    vi.mocked(navigator.mediaDevices.getUserMedia).mockReturnValue(
      cameraRequest,
    );

    const { result, unmount } = renderMediaTracks();

    act(() => result.current.setCamEnabled(true));
    await waitFor(() =>
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
        video: true,
      }),
    );

    act(() => result.current.setCamEnabled(false));

    const staleTrack = new FakeTrack("late-camera", "video");
    await act(async () => {
      resolveCamera(new FakeStream([staleTrack]) as unknown as MediaStream);
      await cameraRequest;
    });

    expect(staleTrack.stop).toHaveBeenCalledOnce();
    expect(result.current.camTrackRef.current).toBeNull();
    expect(result.current.localStreamRef.current?.getVideoTracks()).toEqual([]);
    unmount();
  });

  it("keeps a screen share that resolves across a reconnect blip", async () => {
    // The toggle effect re-runs whenever isConnected flips. Invalidating every
    // in-flight permission request in that cleanup threw away a picker result
    // the user had just completed, so the share silently failed and they had
    // to choose the window again. Only teardown may invalidate.
    let resolveScreen!: (stream: MediaStream) => void;
    const screenRequest = new Promise<MediaStream>((resolve) => {
      resolveScreen = resolve;
    });
    vi.mocked(navigator.mediaDevices.getDisplayMedia).mockReturnValue(
      screenRequest,
    );

    const { result, rerender, unmount } = renderMediaTracks();

    act(() => result.current.setScreenEnabled(true));
    await waitFor(() =>
      expect(navigator.mediaDevices.getDisplayMedia).toHaveBeenCalled(),
    );

    // Socket reconnects while the picker is still open.
    rerender({ isConnected: true });

    const track = new FakeTrack("screen", "video");
    await act(async () => {
      resolveScreen(new FakeStream([track]) as unknown as MediaStream);
      await screenRequest;
    });

    expect(track.stop).not.toHaveBeenCalled();
    expect(result.current.screenTrackRef.current).toBe(
      track as unknown as MediaStreamTrack,
    );
    unmount();
  });

  it("still stops a screen share that resolves after teardown", async () => {
    let resolveScreen!: (stream: MediaStream) => void;
    const screenRequest = new Promise<MediaStream>((resolve) => {
      resolveScreen = resolve;
    });
    vi.mocked(navigator.mediaDevices.getDisplayMedia).mockReturnValue(
      screenRequest,
    );

    const { result, unmount } = renderMediaTracks();

    act(() => result.current.setScreenEnabled(true));
    await waitFor(() =>
      expect(navigator.mediaDevices.getDisplayMedia).toHaveBeenCalled(),
    );

    unmount();

    const track = new FakeTrack("screen-after-unmount", "video");
    await act(async () => {
      resolveScreen(new FakeStream([track]) as unknown as MediaStream);
      await screenRequest;
    });

    expect(track.stop).toHaveBeenCalledOnce();
  });

  it("stops an acquired camera track when the hook unmounts", async () => {
    const track = new FakeTrack("mounted-camera", "video");
    vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue(
      new FakeStream([track]) as unknown as MediaStream,
    );

    const { result, unmount } = renderMediaTracks();
    act(() => result.current.setCamEnabled(true));
    await waitFor(() =>
      expect(result.current.camTrackRef.current).toBe(
        track as unknown as MediaStreamTrack,
      ),
    );

    unmount();

    expect(track.stop).toHaveBeenCalledOnce();
  });

  it("reattaches the same local stream whenever the preview remounts", () => {
    const { result, unmount } = renderMediaTracks();
    const firstVideo = { srcObject: null } as unknown as HTMLVideoElement;
    const secondVideo = { srcObject: null } as unknown as HTMLVideoElement;

    act(() => result.current.setLocalVideoElement(firstVideo));
    const localStream = result.current.localStreamRef.current;
    expect(firstVideo.srcObject).toBe(localStream);

    act(() => result.current.setLocalVideoElement(null));
    act(() => result.current.setLocalVideoElement(secondVideo));

    expect(secondVideo.srcObject).toBe(localStream);
    expect(result.current.localVideoRef.current).toBe(secondVideo);
    unmount();
  });
});
