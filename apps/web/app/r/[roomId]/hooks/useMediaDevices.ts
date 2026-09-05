import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type SelectableMediaDevice = Pick<
  MediaDeviceInfo,
  "deviceId" | "groupId" | "kind" | "label"
>;

const STORAGE_KEYS = {
  audioinput: "huddle.media.audioInput",
  videoinput: "huddle.media.videoInput",
  audiooutput: "huddle.media.audioOutput",
} as const;

type SelectableKind = keyof typeof STORAGE_KEYS;

const EMPTY_REVEALED_INVENTORY: Record<SelectableKind, boolean> = {
  audioinput: false,
  videoinput: false,
  audiooutput: false,
};

function readSelection(kind: keyof typeof STORAGE_KEYS) {
  try {
    return window.localStorage.getItem(STORAGE_KEYS[kind]) ?? "";
  } catch {
    return "";
  }
}

function persistSelection(kind: keyof typeof STORAGE_KEYS, deviceId: string) {
  try {
    if (deviceId) window.localStorage.setItem(STORAGE_KEYS[kind], deviceId);
    else window.localStorage.removeItem(STORAGE_KEYS[kind]);
  } catch {
    // Storage is a convenience. A privacy-mode quota failure must not break a call.
  }
}

export function useMediaDevices({ isClient }: { isClient: boolean }) {
  const [devices, setDevices] = useState<SelectableMediaDevice[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [revealedInventory, setRevealedInventory] = useState(
    EMPTY_REVEALED_INVENTORY,
  );
  const deviceAccessGrantedRef = useRef<"mic" | "cam" | null>(null);
  const [audioInputId, setAudioInputIdState] = useState("");
  const [videoInputId, setVideoInputIdState] = useState("");
  const [audioOutputId, setAudioOutputIdState] = useState("");

  const refresh = useCallback(async () => {
    if (
      typeof navigator === "undefined" ||
      typeof navigator.mediaDevices?.enumerateDevices !== "function"
    ) {
      setInventoryError("Device selection is not supported in this browser.");
      return [];
    }

    setIsRefreshing(true);
    try {
      const next = (await navigator.mediaDevices.enumerateDevices()).map(
        ({ deviceId, groupId, kind, label }) => ({
          deviceId,
          groupId,
          kind,
          label,
        }),
      );
      setDevices(next);
      setRevealedInventory((current) => ({
        audioinput:
          current.audioinput ||
          deviceAccessGrantedRef.current === "mic" ||
          next.some(
            ({ kind, label }) =>
              kind === "audioinput" && label.trim().length > 0,
          ),
        videoinput:
          current.videoinput ||
          deviceAccessGrantedRef.current === "cam" ||
          next.some(
            ({ kind, label }) =>
              kind === "videoinput" && label.trim().length > 0,
          ),
        audiooutput:
          current.audiooutput ||
          next.some(
            ({ kind, label }) =>
              kind === "audiooutput" && label.trim().length > 0,
          ),
      }));
      setInventoryError(null);
      return next;
    } catch {
      setInventoryError(
        "Devices could not be listed. Check this tab's media permissions.",
      );
      return [];
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const refreshAfterAccess = useCallback(
    async (kind: "mic" | "cam") => {
      deviceAccessGrantedRef.current = kind;
      setRevealedInventory((current) => ({
        ...current,
        [kind === "mic" ? "audioinput" : "videoinput"]: true,
      }));
      return refresh();
    },
    [refresh],
  );

  useEffect(() => {
    if (!isClient) return;
    setAudioInputIdState(readSelection("audioinput"));
    setVideoInputIdState(readSelection("videoinput"));
    setAudioOutputIdState(readSelection("audiooutput"));
    void refresh();

    const onDeviceChange = () => void refresh();
    navigator.mediaDevices?.addEventListener?.("devicechange", onDeviceChange);
    return () =>
      navigator.mediaDevices?.removeEventListener?.(
        "devicechange",
        onDeviceChange,
      );
  }, [isClient, refresh]);

  // A remembered USB device can disappear between visits. Falling back to
  // the browser default is preferable to repeatedly requesting a dead id.
  useEffect(() => {
    if (devices.length === 0) return;
    const available = new Set(devices.map(({ deviceId }) => deviceId));
    if (
      revealedInventory.audioinput &&
      audioInputId &&
      !available.has(audioInputId)
    ) {
      setAudioInputIdState("");
      persistSelection("audioinput", "");
    }
    if (
      revealedInventory.videoinput &&
      videoInputId &&
      !available.has(videoInputId)
    ) {
      setVideoInputIdState("");
      persistSelection("videoinput", "");
    }
    if (
      revealedInventory.audiooutput &&
      audioOutputId &&
      !available.has(audioOutputId)
    ) {
      setAudioOutputIdState("");
      persistSelection("audiooutput", "");
    }
  }, [audioInputId, audioOutputId, devices, revealedInventory, videoInputId]);

  const setAudioInputId = useCallback((deviceId: string) => {
    setAudioInputIdState(deviceId);
    persistSelection("audioinput", deviceId);
  }, []);
  const setVideoInputId = useCallback((deviceId: string) => {
    setVideoInputIdState(deviceId);
    persistSelection("videoinput", deviceId);
  }, []);
  const setAudioOutputId = useCallback((deviceId: string) => {
    setAudioOutputIdState(deviceId);
    persistSelection("audiooutput", deviceId);
  }, []);

  const audioInputs = useMemo(
    () => devices.filter(({ kind }) => kind === "audioinput"),
    [devices],
  );
  const videoInputs = useMemo(
    () => devices.filter(({ kind }) => kind === "videoinput"),
    [devices],
  );
  const audioOutputs = useMemo(
    () => devices.filter(({ kind }) => kind === "audiooutput"),
    [devices],
  );
  const outputSelectionSupported =
    isClient &&
    typeof HTMLMediaElement !== "undefined" &&
    "setSinkId" in HTMLMediaElement.prototype;

  useEffect(() => {
    if (!isClient || outputSelectionSupported || !audioOutputId) return;
    // A speaker remembered in Chromium must not strand audio when the same
    // profile is opened in a browser without setSinkId. The selector is hidden
    // there, so fall back automatically rather than leaving an unfixable error.
    setAudioOutputIdState("");
    persistSelection("audiooutput", "");
  }, [audioOutputId, isClient, outputSelectionSupported]);

  return {
    audioInputs,
    videoInputs,
    audioOutputs,
    audioInputId,
    setAudioInputId,
    videoInputId,
    setVideoInputId,
    audioOutputId,
    setAudioOutputId,
    outputSelectionSupported,
    isRefreshing,
    inventoryError,
    refresh,
    refreshAfterAccess,
  };
}
