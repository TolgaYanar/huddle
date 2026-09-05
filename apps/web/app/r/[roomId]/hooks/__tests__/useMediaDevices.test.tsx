import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useMediaDevices } from "../useMediaDevices";

const mediaDevicesDescriptor = Object.getOwnPropertyDescriptor(
  navigator,
  "mediaDevices",
);

function device(
  kind: MediaDeviceKind,
  deviceId: string,
  label: string,
): MediaDeviceInfo {
  return {
    kind,
    deviceId,
    label,
    groupId: "group",
    toJSON: () => ({}),
  };
}

describe("useMediaDevices", () => {
  let deviceChange: (() => void) | null;
  let enumerateDevices: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    window.localStorage.clear();
    deviceChange = null;
    enumerateDevices = vi
      .fn()
      .mockResolvedValue([
        device("audioinput", "mic-1", "Desk mic"),
        device("videoinput", "cam-1", "Webcam"),
        device("audiooutput", "speaker-1", "Headphones"),
      ]);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices,
        addEventListener: (name: string, listener: () => void) => {
          if (name === "devicechange") deviceChange = listener;
        },
        removeEventListener: vi.fn(),
      },
    });
  });

  afterEach(() => {
    window.localStorage.clear();
    if (mediaDevicesDescriptor) {
      Object.defineProperty(navigator, "mediaDevices", mediaDevicesDescriptor);
    } else {
      Reflect.deleteProperty(navigator, "mediaDevices");
    }
  });

  it("lists, remembers and refreshes call devices after a hardware change", async () => {
    const { result, unmount } = renderHook(() =>
      useMediaDevices({ isClient: true }),
    );
    await waitFor(() => expect(result.current.audioInputs).toHaveLength(1));

    act(() => result.current.setAudioInputId("mic-1"));
    expect(window.localStorage.getItem("huddle.media.audioInput")).toBe(
      "mic-1",
    );

    enumerateDevices.mockResolvedValue([
      device("audioinput", "mic-2", "USB mic"),
    ]);
    await act(async () => deviceChange?.());
    await waitFor(() => expect(result.current.audioInputId).toBe(""));
    expect(result.current.audioInputs[0]?.deviceId).toBe("mic-2");
    unmount();
  });

  it("keeps a remembered device while the pre-permission inventory is limited", async () => {
    window.localStorage.setItem("huddle.media.audioInput", "usb-mic");
    enumerateDevices.mockResolvedValueOnce([
      device("audioinput", "default", ""),
      device("videoinput", "default-camera", ""),
    ]);

    const { result, unmount } = renderHook(() =>
      useMediaDevices({ isClient: true }),
    );
    await waitFor(() => expect(result.current.audioInputs).toHaveLength(1));

    expect(result.current.audioInputId).toBe("usb-mic");
    expect(window.localStorage.getItem("huddle.media.audioInput")).toBe(
      "usb-mic",
    );

    enumerateDevices.mockResolvedValueOnce([
      device("audioinput", "default", "Built-in microphone"),
      device("audioinput", "usb-mic", "Desk USB microphone"),
    ]);
    await act(async () => {
      await result.current.refreshAfterAccess("mic");
    });

    expect(result.current.audioInputId).toBe("usb-mic");
    expect(window.localStorage.getItem("huddle.media.audioInput")).toBe(
      "usb-mic",
    );
    unmount();
  });

  it("falls back from a remembered speaker when output routing is unsupported", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      HTMLMediaElement.prototype,
      "setSinkId",
    );
    Reflect.deleteProperty(HTMLMediaElement.prototype, "setSinkId");
    window.localStorage.setItem("huddle.media.audioOutput", "speaker-1");

    try {
      const { result, unmount } = renderHook(() =>
        useMediaDevices({ isClient: true }),
      );
      await waitFor(() => expect(result.current.audioOutputId).toBe(""));
      expect(
        window.localStorage.getItem("huddle.media.audioOutput"),
      ).toBeNull();
      unmount();
    } finally {
      if (descriptor) {
        Object.defineProperty(
          HTMLMediaElement.prototype,
          "setSinkId",
          descriptor,
        );
      }
    }
  });
});
