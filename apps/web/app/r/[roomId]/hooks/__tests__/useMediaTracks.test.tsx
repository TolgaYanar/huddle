import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useMediaTracks } from "../useMediaTracks";
import { usePushToTalkBinding } from "../usePushToTalkBinding";

class FakeTrack {
  id: string;
  kind: "audio" | "video";
  enabled = true;
  readyState: MediaStreamTrackState = "live";
  onended: (() => void) | null = null;
  stop = vi.fn();

  constructor(id: string, kind: "audio" | "video") {
    this.id = id;
    this.kind = kind;
  }
}

class FakeStream {
  private tracks: FakeTrack[];
  addedTrackEnabledStates: boolean[] = [];

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
    if (!this.tracks.includes(track)) {
      this.addedTrackEnabledStates.push(track.enabled);
      this.tracks.push(track);
    }
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

function renderMediaTracks(options?: {
  isConnected?: boolean;
  audioInputId?: string;
  videoInputId?: string;
  pushToTalkEnabled?: boolean;
}) {
  const pushToTalkDownRef = { current: false };
  return renderHook(
    ({
      isConnected,
      audioInputId = "",
      videoInputId = "",
      pushToTalkEnabled = false,
    }: {
      isConnected: boolean;
      audioInputId?: string;
      videoInputId?: string;
      pushToTalkEnabled?: boolean;
    }) =>
      useMediaTracks({
        isClient: true,
        isConnected,
        userId: "self",
        echoCancellationEnabled: true,
        noiseSuppressionEnabled: true,
        autoGainControlEnabled: true,
        audioInputId,
        videoInputId,
        pushToTalkEnabled,
        pushToTalkDownRef,
        sendWebRTCMediaState: vi.fn(),
        sendWebRTCSpeaking: vi.fn(),
        renegotiateAllPeers: vi.fn().mockResolvedValue(undefined),
      }),
    {
      initialProps: {
        isConnected: options?.isConnected ?? false,
        audioInputId: options?.audioInputId ?? "",
        videoInputId: options?.videoInputId ?? "",
        pushToTalkEnabled: options?.pushToTalkEnabled ?? false,
      },
    },
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
    rerender({
      isConnected: true,
      audioInputId: "",
      videoInputId: "",
      pushToTalkEnabled: false,
    });

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

  it("closes the push-to-talk gate on keyup without waiting for a VAD frame", async () => {
    const track = new FakeTrack("ptt-mic", "audio");
    vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue(
      new FakeStream([track]) as unknown as MediaStream,
    );

    const { result, unmount } = renderHook(() => {
      const downRef = React.useRef(false);
      const media = useMediaTracks({
        isClient: true,
        isConnected: true,
        userId: "self",
        echoCancellationEnabled: true,
        noiseSuppressionEnabled: true,
        autoGainControlEnabled: true,
        pushToTalkEnabled: true,
        pushToTalkDownRef: downRef,
        sendWebRTCMediaState: vi.fn(),
        sendWebRTCSpeaking: vi.fn(),
        renegotiateAllPeers: vi.fn().mockResolvedValue(undefined),
      });
      usePushToTalkBinding({
        isClient: true,
        enabled: true,
        micEnabled: media.micEnabled,
        downRef,
        onTransmitChange: media.applyPushToTalkGate,
      });
      return media;
    });

    act(() => result.current.setMicEnabled(true));
    await waitFor(() => expect(result.current.micTrackRef.current).toBe(track));
    expect(track.enabled).toBe(false);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
    });
    expect(track.enabled).toBe(true);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space" }));
    });
    expect(track.enabled).toBe(false);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
    });
    expect(track.enabled).toBe(true);
    const visibilityDescriptor = Object.getOwnPropertyDescriptor(
      document,
      "visibilityState",
    );
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(track.enabled).toBe(false);
    if (visibilityDescriptor) {
      Object.defineProperty(document, "visibilityState", visibilityDescriptor);
    } else {
      Reflect.deleteProperty(document, "visibilityState");
    }
    unmount();
  });

  it("can close a live microphone synchronously before push-to-talk state commits", async () => {
    const track = new FakeTrack("live-mic", "audio");
    vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue(
      new FakeStream([track]) as unknown as MediaStream,
    );
    const { result, unmount } = renderMediaTracks({ isConnected: true });

    act(() => result.current.setMicEnabled(true));
    await waitFor(() => expect(result.current.micTrackRef.current).toBe(track));
    expect(track.enabled).toBe(true);

    act(() => result.current.closePushToTalkGate());
    expect(track.enabled).toBe(false);
    unmount();
  });

  it("installs a pending microphone muted when push-to-talk is enabled during permission", async () => {
    let resolveMicrophone!: (stream: MediaStream) => void;
    const permissionRequest = new Promise<MediaStream>((resolve) => {
      resolveMicrophone = resolve;
    });
    vi.mocked(navigator.mediaDevices.getUserMedia).mockReturnValue(
      permissionRequest,
    );
    const { result, rerender, unmount } = renderMediaTracks({
      isConnected: true,
      pushToTalkEnabled: false,
    });

    act(() => result.current.setMicEnabled(true));
    await waitFor(() =>
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledOnce(),
    );

    act(() => result.current.closePushToTalkGate());
    rerender({
      isConnected: true,
      audioInputId: "",
      videoInputId: "",
      pushToTalkEnabled: true,
    });

    const track = new FakeTrack("permission-mic", "audio");
    await act(async () => {
      resolveMicrophone(new FakeStream([track]) as unknown as MediaStream);
      await permissionRequest;
    });

    const local = result.current.localStreamRef
      .current as unknown as FakeStream;
    expect(local.addedTrackEnabledStates).toEqual([false]);
    expect(track.enabled).toBe(false);
    unmount();
  });

  it("announces media only after a real track exists", async () => {
    let resolveMicrophone!: (stream: MediaStream) => void;
    const request = new Promise<MediaStream>((resolve) => {
      resolveMicrophone = resolve;
    });
    vi.mocked(navigator.mediaDevices.getUserMedia).mockReturnValue(request);
    const sendWebRTCMediaState = vi.fn();
    const { result, unmount } = renderHook(() =>
      useMediaTracks({
        isClient: true,
        isConnected: true,
        userId: "self",
        echoCancellationEnabled: true,
        noiseSuppressionEnabled: true,
        autoGainControlEnabled: true,
        pushToTalkEnabled: false,
        pushToTalkDownRef: { current: false },
        sendWebRTCMediaState,
        sendWebRTCSpeaking: vi.fn(),
        renegotiateAllPeers: vi.fn().mockResolvedValue(undefined),
      }),
    );

    act(() => result.current.setMicEnabled(true));
    await waitFor(() =>
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled(),
    );
    expect(sendWebRTCMediaState).toHaveBeenLastCalledWith({
      mic: false,
      cam: false,
      screen: false,
    });

    const track = new FakeTrack("permission-mic", "audio");
    await act(async () => {
      resolveMicrophone(new FakeStream([track]) as unknown as MediaStream);
      await request;
    });
    await waitFor(() =>
      expect(sendWebRTCMediaState).toHaveBeenLastCalledWith({
        mic: true,
        cam: false,
        screen: false,
      }),
    );
    unmount();
  });

  it("announces the camera as off while screen sharing replaces its video track", async () => {
    const camera = new FakeTrack("camera", "video");
    const screen = new FakeTrack("screen", "video");
    vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue(
      new FakeStream([camera]) as unknown as MediaStream,
    );
    vi.mocked(navigator.mediaDevices.getDisplayMedia).mockResolvedValue(
      new FakeStream([screen]) as unknown as MediaStream,
    );
    const sendWebRTCMediaState = vi.fn();
    const { result, unmount } = renderHook(() =>
      useMediaTracks({
        isClient: true,
        isConnected: true,
        userId: "self",
        echoCancellationEnabled: true,
        noiseSuppressionEnabled: true,
        autoGainControlEnabled: true,
        pushToTalkEnabled: false,
        pushToTalkDownRef: { current: false },
        sendWebRTCMediaState,
        sendWebRTCSpeaking: vi.fn(),
        renegotiateAllPeers: vi.fn().mockResolvedValue(undefined),
      }),
    );

    act(() => result.current.setCamEnabled(true));
    await waitFor(() =>
      expect(sendWebRTCMediaState).toHaveBeenLastCalledWith({
        mic: false,
        cam: true,
        screen: false,
      }),
    );

    act(() => result.current.setScreenEnabled(true));
    await waitFor(() =>
      expect(sendWebRTCMediaState).toHaveBeenLastCalledWith({
        mic: false,
        cam: false,
        screen: true,
      }),
    );

    act(() => result.current.setScreenEnabled(false));
    await waitFor(() =>
      expect(sendWebRTCMediaState).toHaveBeenLastCalledWith({
        mic: false,
        cam: true,
        screen: false,
      }),
    );
    unmount();
  });

  it("turns the microphone off and explains when its physical track ends", async () => {
    const track = new FakeTrack("unplugged-mic", "audio");
    vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue(
      new FakeStream([track]) as unknown as MediaStream,
    );
    const { result, unmount } = renderMediaTracks({ isConnected: true });

    act(() => result.current.setMicEnabled(true));
    await waitFor(() => expect(result.current.micTrackRef.current).toBe(track));

    act(() => {
      track.readyState = "ended";
      track.onended?.();
    });

    expect(result.current.micEnabled).toBe(false);
    expect(result.current.micTrackRef.current).toBeNull();
    expect(result.current.mediaErrors.mic).toMatch(/disconnected/i);
    unmount();
  });

  it("turns a permission rejection into an actionable microphone error", async () => {
    const denied = new DOMException("Permission denied", "NotAllowedError");
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(denied);
    const { result, unmount } = renderMediaTracks();

    act(() => result.current.setMicEnabled(true));

    await waitFor(() =>
      expect(result.current.mediaErrors.mic).toMatch(/browser settings/i),
    );
    expect(result.current.micEnabled).toBe(false);
    expect(result.current.mediaPending.mic).toBe(false);
    unmount();
  });

  it("replaces a live microphone when the selected input changes", async () => {
    const first = new FakeTrack("first-mic", "audio");
    const second = new FakeTrack("second-mic", "audio");
    vi.mocked(navigator.mediaDevices.getUserMedia)
      .mockResolvedValueOnce(new FakeStream([first]) as unknown as MediaStream)
      .mockResolvedValueOnce(
        new FakeStream([second]) as unknown as MediaStream,
      );

    const { result, rerender, unmount } = renderMediaTracks({
      isConnected: true,
      audioInputId: "mic-a",
    });
    act(() => result.current.setMicEnabled(true));
    await waitFor(() => expect(result.current.micTrackRef.current).toBe(first));

    rerender({
      isConnected: true,
      audioInputId: "mic-b",
      videoInputId: "",
      pushToTalkEnabled: false,
    });
    await waitFor(() =>
      expect(result.current.micTrackRef.current).toBe(second),
    );

    expect(first.stop).toHaveBeenCalledOnce();
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenLastCalledWith({
      audio: {
        deviceId: { exact: "mic-b" },
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    unmount();
  });

  it("keeps only the newest microphone across two rapid device changes", async () => {
    const first = new FakeTrack("first-mic", "audio");
    const stale = new FakeTrack("stale-mic", "audio");
    const newest = new FakeTrack("newest-mic", "audio");
    let resolveStale!: (stream: MediaStream) => void;
    let resolveNewest!: (stream: MediaStream) => void;
    const staleRequest = new Promise<MediaStream>((resolve) => {
      resolveStale = resolve;
    });
    const newestRequest = new Promise<MediaStream>((resolve) => {
      resolveNewest = resolve;
    });
    vi.mocked(navigator.mediaDevices.getUserMedia)
      .mockResolvedValueOnce(new FakeStream([first]) as unknown as MediaStream)
      .mockReturnValueOnce(staleRequest)
      .mockReturnValueOnce(newestRequest);

    const { result, rerender, unmount } = renderMediaTracks({
      isConnected: true,
      audioInputId: "mic-a",
    });
    act(() => result.current.setMicEnabled(true));
    await waitFor(() => expect(result.current.micTrackRef.current).toBe(first));

    rerender({
      isConnected: true,
      audioInputId: "mic-b",
      videoInputId: "",
      pushToTalkEnabled: false,
    });
    await waitFor(() =>
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(2),
    );
    rerender({
      isConnected: true,
      audioInputId: "mic-c",
      videoInputId: "",
      pushToTalkEnabled: false,
    });
    await waitFor(() =>
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(3),
    );

    await act(async () => {
      resolveStale(new FakeStream([stale]) as unknown as MediaStream);
      resolveNewest(new FakeStream([newest]) as unknown as MediaStream);
      await Promise.all([staleRequest, newestRequest]);
    });

    await waitFor(() =>
      expect(result.current.micTrackRef.current).toBe(newest),
    );
    expect(stale.stop).toHaveBeenCalledOnce();
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenLastCalledWith({
      audio: {
        deviceId: { exact: "mic-c" },
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    unmount();
  });

  it("keeps only the newest camera across two rapid device changes", async () => {
    const first = new FakeTrack("first-camera", "video");
    const stale = new FakeTrack("stale-camera", "video");
    const newest = new FakeTrack("newest-camera", "video");
    let resolveStale!: (stream: MediaStream) => void;
    let resolveNewest!: (stream: MediaStream) => void;
    const staleRequest = new Promise<MediaStream>((resolve) => {
      resolveStale = resolve;
    });
    const newestRequest = new Promise<MediaStream>((resolve) => {
      resolveNewest = resolve;
    });
    vi.mocked(navigator.mediaDevices.getUserMedia)
      .mockResolvedValueOnce(new FakeStream([first]) as unknown as MediaStream)
      .mockReturnValueOnce(staleRequest)
      .mockReturnValueOnce(newestRequest);

    const { result, rerender, unmount } = renderMediaTracks({
      isConnected: true,
      videoInputId: "cam-a",
    });
    act(() => result.current.setCamEnabled(true));
    await waitFor(() => expect(result.current.camTrackRef.current).toBe(first));

    rerender({
      isConnected: true,
      audioInputId: "",
      videoInputId: "cam-b",
      pushToTalkEnabled: false,
    });
    await waitFor(() =>
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(2),
    );
    rerender({
      isConnected: true,
      audioInputId: "",
      videoInputId: "cam-c",
      pushToTalkEnabled: false,
    });
    await waitFor(() =>
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(3),
    );

    await act(async () => {
      resolveStale(new FakeStream([stale]) as unknown as MediaStream);
      resolveNewest(new FakeStream([newest]) as unknown as MediaStream);
      await Promise.all([staleRequest, newestRequest]);
    });

    await waitFor(() =>
      expect(result.current.camTrackRef.current).toBe(newest),
    );
    expect(stale.stop).toHaveBeenCalledOnce();
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenLastCalledWith({
      video: { deviceId: { exact: "cam-c" } },
    });
    unmount();
  });
});
