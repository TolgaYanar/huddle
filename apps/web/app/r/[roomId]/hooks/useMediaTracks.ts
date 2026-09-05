import { useCallback, useEffect, useRef, useState } from "react";

interface UseMediaTracksProps {
  isClient: boolean;
  isConnected: boolean;
  userId: string;
  echoCancellationEnabled: boolean;
  noiseSuppressionEnabled: boolean;
  autoGainControlEnabled: boolean;
  audioInputId?: string;
  videoInputId?: string;
  pushToTalkEnabled: boolean;
  pushToTalkDownRef: React.MutableRefObject<boolean>;
  sendWebRTCMediaState: (state: {
    mic: boolean;
    cam: boolean;
    screen: boolean;
  }) => void;
  sendWebRTCSpeaking: (speaking: boolean) => void;
  renegotiateAllPeers: () => Promise<void>;
  onDeviceAccess?: (kind: "mic" | "cam") => void;
}

export type MediaDeviceKind = "mic" | "cam" | "screen";
export type MediaDeviceErrors = Partial<Record<MediaDeviceKind, string>>;
export type MediaDevicePending = Record<MediaDeviceKind, boolean>;

function mediaDeviceErrorMessage(kind: MediaDeviceKind, error: unknown) {
  const label =
    kind === "mic" ? "Microphone" : kind === "cam" ? "Camera" : "Screen";
  const name = (error as { name?: unknown } | null)?.name;

  if (name === "NotAllowedError" || name === "SecurityError") {
    return `${label} permission is blocked. Allow it in your browser settings, then try again.`;
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return `No ${label.toLowerCase()} source was found. Connect a device and try again.`;
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return `${label} is unavailable or being used by another app. Close the other app and try again.`;
  }
  if (
    name === "OverconstrainedError" ||
    name === "ConstraintNotSatisfiedError"
  ) {
    return `${label} does not support the requested settings. Choose another device and try again.`;
  }
  if (name === "AbortError") {
    return `${label} request was interrupted. Try again.`;
  }
  if (
    typeof navigator === "undefined" ||
    !navigator.mediaDevices ||
    (kind === "screen"
      ? typeof navigator.mediaDevices.getDisplayMedia !== "function"
      : typeof navigator.mediaDevices.getUserMedia !== "function")
  ) {
    return `${label} access is not supported in this browser or connection.`;
  }
  return `${label} could not start. Check the device and browser permissions, then try again.`;
}

export function useMediaTracks({
  isClient,
  isConnected,
  userId,
  echoCancellationEnabled,
  noiseSuppressionEnabled,
  autoGainControlEnabled,
  audioInputId = "",
  videoInputId = "",
  pushToTalkEnabled,
  pushToTalkDownRef,
  sendWebRTCMediaState,
  sendWebRTCSpeaking,
  renegotiateAllPeers,
  onDeviceAccess,
}: UseMediaTracksProps) {
  const localStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const micTrackRef = useRef<MediaStreamTrack | null>(null);
  const camTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const micSourceIdRef = useRef("");
  const camSourceIdRef = useRef("");
  const micRequestGenerationRef = useRef(0);
  const camRequestGenerationRef = useRef(0);
  const screenRequestGenerationRef = useRef(0);
  const pushToTalkEnabledRef = useRef(pushToTalkEnabled);
  // Render is synchronous even while a permission promise is pending. Keep
  // acquisition callbacks on the latest privacy mode rather than the mode
  // captured when getUserMedia() opened its browser prompt.
  pushToTalkEnabledRef.current = pushToTalkEnabled;
  // In-flight permission requests. The toggle effect re-runs on every
  // isConnected change, and without these the re-run started a *second*
  // getUserMedia/getDisplayMedia while the first was still pending — which
  // bumped the generation and invalidated the request the user was actively
  // answering. For screen share that discarded a completed picker choice.
  const micPendingRef = useRef<Promise<boolean> | null>(null);
  const camPendingRef = useRef<Promise<boolean> | null>(null);
  const screenPendingRef = useRef<Promise<boolean> | null>(null);

  const [micEnabled, setMicEnabled] = useState(false);
  const [camEnabled, setCamEnabled] = useState(false);
  const [screenEnabled, setScreenEnabled] = useState(false);
  const [localSpeaking, setLocalSpeaking] = useState(false);
  const [micTrackVersion, setMicTrackVersion] = useState(0);
  const [camTrackVersion, setCamTrackVersion] = useState(0);
  const [screenTrackVersion, setScreenTrackVersion] = useState(0);
  const [mediaErrors, setMediaErrors] = useState<MediaDeviceErrors>({});
  const [mediaPending, setMediaPending] = useState<MediaDevicePending>({
    mic: false,
    cam: false,
    screen: false,
  });

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadRafRef = useRef<number | null>(null);
  const lastVoiceAtRef = useRef<number>(0);
  const lastSpeakingRef = useRef<boolean>(false);

  const setPending = useCallback((kind: MediaDeviceKind, pending: boolean) => {
    setMediaPending((current) =>
      current[kind] === pending ? current : { ...current, [kind]: pending },
    );
  }, []);

  const clearError = useCallback((kind: MediaDeviceKind) => {
    setMediaErrors((current) => {
      if (!current[kind]) return current;
      const next = { ...current };
      delete next[kind];
      return next;
    });
  }, []);

  const reportError = useCallback((kind: MediaDeviceKind, error: unknown) => {
    const message = mediaDeviceErrorMessage(kind, error);
    setMediaErrors((current) => ({ ...current, [kind]: message }));
  }, []);

  const ensureLocalStream = useCallback(() => {
    if (localStreamRef.current) return localStreamRef.current;
    if (typeof window === "undefined") return null;
    if (typeof MediaStream === "undefined") return null;
    localStreamRef.current = new MediaStream();
    return localStreamRef.current;
  }, []);

  const ensureMicEnabled = useCallback(async () => {
    if (
      micTrackRef.current &&
      micTrackRef.current.readyState !== "ended" &&
      micSourceIdRef.current === audioInputId
    )
      return true;
    if (micTrackRef.current) {
      const previous = micTrackRef.current;
      previous.onended = null;
      localStreamRef.current?.removeTrack(previous);
      previous.stop();
      micTrackRef.current = null;
    }
    // Reuse an in-flight request instead of racing a second one against it.
    const inFlight = micPendingRef.current;
    if (inFlight) return inFlight;
    const local = ensureLocalStream();
    if (!local)
      throw new DOMException("Media unavailable", "NotSupportedError");
    const requestGeneration = ++micRequestGenerationRef.current;
    setPending("mic", true);
    clearError("mic");
    const request = (async () => {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...(audioInputId ? { deviceId: { exact: audioInputId } } : {}),
          echoCancellation: echoCancellationEnabled,
          noiseSuppression: noiseSuppressionEnabled,
          autoGainControl: autoGainControlEnabled,
        },
      });
      const track = stream.getAudioTracks()[0] ?? null;
      if (!track) {
        stream.getTracks().forEach((streamTrack) => streamTrack.stop());
        throw new DOMException("No microphone track", "NotFoundError");
      }
      if (requestGeneration !== micRequestGenerationRef.current) {
        stream.getTracks().forEach((streamTrack) => streamTrack.stop());
        return false;
      }
      stream
        .getTracks()
        .filter((streamTrack) => streamTrack !== track)
        .forEach((streamTrack) => streamTrack.stop());
      micTrackRef.current = track;
      micSourceIdRef.current = audioInputId;
      onDeviceAccess?.("mic");
      track.enabled =
        !pushToTalkEnabledRef.current || pushToTalkDownRef.current;
      track.onended = () => {
        if (micTrackRef.current !== track) return;
        localStreamRef.current?.removeTrack(track);
        micTrackRef.current = null;
        micSourceIdRef.current = "";
        lastSpeakingRef.current = false;
        setLocalSpeaking(false);
        sendWebRTCSpeaking(false);
        setMicTrackVersion((v) => v + 1);
        setMicEnabled(false);
        setMediaErrors((current) => ({
          ...current,
          mic: "Microphone disconnected or permission was removed. Reconnect it and try again.",
        }));
      };
      local.addTrack(track);
      setMicTrackVersion((v) => v + 1);
      return true;
    })();
    micPendingRef.current = request;
    try {
      return await request;
    } finally {
      if (micPendingRef.current === request) {
        micPendingRef.current = null;
        setPending("mic", false);
      }
    }
  }, [
    ensureLocalStream,
    audioInputId,
    echoCancellationEnabled,
    noiseSuppressionEnabled,
    autoGainControlEnabled,
    clearError,
    pushToTalkDownRef,
    sendWebRTCSpeaking,
    setPending,
    onDeviceAccess,
  ]);

  const disableMic = useCallback(
    (skipStateUpdates = false) => {
      micRequestGenerationRef.current += 1;
      micPendingRef.current = null;
      setPending("mic", false);
      const t = micTrackRef.current;
      if (t) {
        t.onended = null;
        try {
          localStreamRef.current?.removeTrack(t);
        } catch {
          // ignore
        }
        try {
          t.stop();
        } catch {
          // ignore
        }
      }
      micTrackRef.current = null;
      micSourceIdRef.current = "";
      if (!skipStateUpdates) {
        setMicTrackVersion((v) => v + 1);
        setLocalSpeaking(false);
        sendWebRTCSpeaking(false);
      }
    },
    [sendWebRTCSpeaking, setPending],
  );

  const ensureCamEnabled = useCallback(async () => {
    if (
      camTrackRef.current &&
      camTrackRef.current.readyState !== "ended" &&
      camSourceIdRef.current === videoInputId
    )
      return true;
    if (camTrackRef.current) {
      const previous = camTrackRef.current;
      previous.onended = null;
      localStreamRef.current?.removeTrack(previous);
      previous.stop();
      camTrackRef.current = null;
    }
    // Reuse an in-flight request instead of racing a second one against it.
    const inFlight = camPendingRef.current;
    if (inFlight) return inFlight;
    const local = ensureLocalStream();
    if (!local)
      throw new DOMException("Media unavailable", "NotSupportedError");
    const requestGeneration = ++camRequestGenerationRef.current;
    setPending("cam", true);
    clearError("cam");
    const request = (async () => {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoInputId ? { deviceId: { exact: videoInputId } } : true,
      });
      const track = stream.getVideoTracks()[0] ?? null;
      if (!track) {
        stream.getTracks().forEach((streamTrack) => streamTrack.stop());
        throw new DOMException("No camera track", "NotFoundError");
      }
      if (requestGeneration !== camRequestGenerationRef.current) {
        stream.getTracks().forEach((streamTrack) => streamTrack.stop());
        return false;
      }
      stream
        .getTracks()
        .filter((streamTrack) => streamTrack !== track)
        .forEach((streamTrack) => streamTrack.stop());
      camTrackRef.current = track;
      camSourceIdRef.current = videoInputId;
      onDeviceAccess?.("cam");
      track.onended = () => {
        if (camTrackRef.current !== track) return;
        localStreamRef.current?.removeTrack(track);
        camTrackRef.current = null;
        camSourceIdRef.current = "";
        setCamTrackVersion((v) => v + 1);
        setCamEnabled(false);
        setMediaErrors((current) => ({
          ...current,
          cam: "Camera disconnected or permission was removed. Reconnect it and try again.",
        }));
      };
      setCamTrackVersion((v) => v + 1);
      if (!screenTrackRef.current) {
        local.addTrack(track);
      }
      return true;
    })();
    camPendingRef.current = request;
    try {
      return await request;
    } finally {
      if (camPendingRef.current === request) {
        camPendingRef.current = null;
        setPending("cam", false);
      }
    }
  }, [clearError, ensureLocalStream, onDeviceAccess, setPending, videoInputId]);

  const disableCam = useCallback(
    (skipStateUpdates = false) => {
      camRequestGenerationRef.current += 1;
      camPendingRef.current = null;
      setPending("cam", false);
      const t = camTrackRef.current;
      if (t) {
        t.onended = null;
        try {
          localStreamRef.current?.removeTrack(t);
        } catch {
          // ignore
        }
        try {
          t.stop();
        } catch {
          // ignore
        }
      }
      camTrackRef.current = null;
      camSourceIdRef.current = "";
      if (!skipStateUpdates) setCamTrackVersion((v) => v + 1);
    },
    [setPending],
  );

  const ensureScreenEnabled = useCallback(async () => {
    if (screenTrackRef.current && screenTrackRef.current.readyState !== "ended")
      return true;
    // Reuse an in-flight request instead of racing a second one against it.
    const inFlight = screenPendingRef.current;
    if (inFlight) return inFlight;
    const local = ensureLocalStream();
    if (!local)
      throw new DOMException("Media unavailable", "NotSupportedError");
    const requestGeneration = ++screenRequestGenerationRef.current;
    setPending("screen", true);
    clearError("screen");
    const request = (async () => {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      const track = stream.getVideoTracks()[0] ?? null;
      if (!track) {
        stream.getTracks().forEach((streamTrack) => streamTrack.stop());
        throw new DOMException("No screen track", "NotFoundError");
      }
      if (requestGeneration !== screenRequestGenerationRef.current) {
        stream.getTracks().forEach((streamTrack) => streamTrack.stop());
        return false;
      }

      screenStreamRef.current = stream;
      screenTrackRef.current = track;
      setScreenTrackVersion((v) => v + 1);

      for (const vt of local.getVideoTracks()) {
        local.removeTrack(vt);
      }
      local.addTrack(track);

      track.onended = () => {
        if (screenTrackRef.current !== track) return;
        setScreenEnabled(false);
      };
      return true;
    })();
    screenPendingRef.current = request;
    try {
      return await request;
    } finally {
      if (screenPendingRef.current === request) {
        screenPendingRef.current = null;
        setPending("screen", false);
      }
    }
  }, [clearError, ensureLocalStream, setPending]);

  const disableScreen = useCallback(() => {
    screenRequestGenerationRef.current += 1;
    screenPendingRef.current = null;
    setPending("screen", false);
    const t = screenTrackRef.current;
    const s = screenStreamRef.current;

    if (t) {
      t.onended = null;
      try {
        localStreamRef.current?.removeTrack(t);
      } catch {
        // ignore
      }
      try {
        t.stop();
      } catch {
        // ignore
      }
    }
    if (s) {
      try {
        s.getTracks().forEach((tt) => tt.stop());
      } catch {
        // ignore
      }
    }

    screenTrackRef.current = null;
    screenStreamRef.current = null;
    setScreenTrackVersion((v) => v + 1);

    const camTrack = camTrackRef.current;
    if (camTrack) {
      try {
        localStreamRef.current?.addTrack(camTrack);
      } catch {
        // ignore
      }
    }
  }, [setPending]);

  // Push-to-talk is a privacy gate, not a visual speaking indicator. Apply it
  // directly from key/mouse events as well as React state so keyup, blur and a
  // backgrounded tab cannot wait for requestAnimationFrame before muting.
  const applyPushToTalkGate = useCallback(
    (isDown: boolean) => {
      pushToTalkDownRef.current = isDown;
      const canTransmit = !pushToTalkEnabledRef.current || isDown;
      const track = micTrackRef.current;
      if (track && track.readyState !== "ended") {
        track.enabled = canTransmit;
      }
      if (!canTransmit && lastSpeakingRef.current) {
        lastSpeakingRef.current = false;
        setLocalSpeaking(false);
        sendWebRTCSpeaking(false);
      }
    },
    [pushToTalkDownRef, sendWebRTCSpeaking],
  );

  // Enabling push-to-talk must close the microphone before React can commit
  // the new `pushToTalkEnabled` value. Calling applyPushToTalkGate here would
  // still use the previous render's `false` value and briefly leave a live mic
  // open, which is a privacy leak rather than a cosmetic state mismatch.
  const closePushToTalkGate = useCallback(() => {
    // DeviceControls calls this synchronously before committing the parent
    // `pushToTalkEnabled=true` state. Mark the desired mode now so a pending
    // permission result cannot install an enabled microphone in that gap.
    pushToTalkEnabledRef.current = true;
    pushToTalkDownRef.current = false;
    const track = micTrackRef.current;
    if (track && track.readyState !== "ended") track.enabled = false;
    if (lastSpeakingRef.current) {
      lastSpeakingRef.current = false;
      setLocalSpeaking(false);
      sendWebRTCSpeaking(false);
    }
  }, [pushToTalkDownRef, sendWebRTCSpeaking]);

  useEffect(() => {
    applyPushToTalkGate(pushToTalkDownRef.current);
  }, [applyPushToTalkGate, micTrackVersion, pushToTalkDownRef]);

  // A callback ref runs every time conditional UI remounts the preview. A
  // one-shot effect only saw the first element and left later video elements
  // black after theatre/collapse/password-gate transitions.
  const setLocalVideoElement = useCallback(
    (element: HTMLVideoElement | null) => {
      localVideoRef.current = element;
      if (!element || !isClient) return;
      const stream = ensureLocalStream();
      if (stream) element.srcObject = stream;
    },
    [ensureLocalStream, isClient],
  );

  // Invalidate every in-flight permission request on unmount.
  //
  // This must NOT live in the toggle effect's cleanup. That cleanup also runs
  // whenever isConnected flips (a reconnect blip), and bumping the generations
  // there discarded a permission result the user still wanted — for screen
  // share that means the picker they just completed is thrown away and they
  // have to choose the window again. Turning a medium off already bumps its
  // generation inside disableMic/disableCam/disableScreen, so the only case
  // left for a blanket invalidation is teardown.
  useEffect(() => {
    return () => {
      micRequestGenerationRef.current += 1;
      camRequestGenerationRef.current += 1;
      screenRequestGenerationRef.current += 1;
      micPendingRef.current = null;
      camPendingRef.current = null;
      screenPendingRef.current = null;

      const tracks = new Set<MediaStreamTrack>([
        ...(localStreamRef.current?.getTracks() ?? []),
        ...(screenStreamRef.current?.getTracks() ?? []),
        ...[
          micTrackRef.current,
          camTrackRef.current,
          screenTrackRef.current,
        ].filter((track): track is MediaStreamTrack => track !== null),
      ]);
      if (screenTrackRef.current) screenTrackRef.current.onended = null;
      for (const track of tracks) {
        try {
          track.stop();
        } catch {
          // ignore teardown failures
        }
      }

      if (localVideoRef.current) localVideoRef.current.srcObject = null;
      localVideoRef.current = null;
      localStreamRef.current = null;
      screenStreamRef.current = null;
      micTrackRef.current = null;
      camTrackRef.current = null;
      screenTrackRef.current = null;
      micSourceIdRef.current = "";
      camSourceIdRef.current = "";
    };
  }, []);

  const getCurrentMediaState = useCallback(
    () => ({
      mic: Boolean(
        micEnabled &&
        micTrackRef.current &&
        micTrackRef.current.readyState !== "ended",
      ),
      cam: Boolean(
        camEnabled &&
        !screenEnabled &&
        camTrackRef.current &&
        camTrackRef.current.readyState !== "ended",
      ),
      screen: Boolean(
        screenEnabled &&
        screenTrackRef.current &&
        screenTrackRef.current.readyState !== "ended",
      ),
    }),
    [camEnabled, micEnabled, screenEnabled],
  );

  const broadcastCurrentMediaState = useCallback(() => {
    if (!isConnected || !userId) return;
    sendWebRTCMediaState(getCurrentMediaState());
  }, [getCurrentMediaState, isConnected, userId, sendWebRTCMediaState]);

  const broadcastCurrentSpeakingState = useCallback(() => {
    if (!isConnected || !userId) return;
    sendWebRTCSpeaking(lastSpeakingRef.current);
  }, [isConnected, sendWebRTCSpeaking, userId]);

  // Broadcast what is actually live, not what the user asked for. Permission
  // prompts can remain open indefinitely and can be rejected; advertising a
  // mic/camera before a usable track exists misleads everyone else in the room.
  useEffect(() => {
    broadcastCurrentMediaState();
  }, [
    broadcastCurrentMediaState,
    micTrackVersion,
    camTrackVersion,
    screenTrackVersion,
  ]);

  // Handle track toggles
  useEffect(() => {
    if (!isClient) return;
    let cancelled = false;

    (async () => {
      try {
        if (micEnabled) await ensureMicEnabled();
        else disableMic();
      } catch (error) {
        if (!cancelled) {
          reportError("mic", error);
          setMicEnabled(false);
        }
      }
      if (cancelled) return;

      try {
        if (camEnabled) await ensureCamEnabled();
        else disableCam();
      } catch (error) {
        if (!cancelled) {
          reportError("cam", error);
          setCamEnabled(false);
        }
      }
      if (cancelled) return;

      try {
        if (screenEnabled) await ensureScreenEnabled();
        else disableScreen();
      } catch (error) {
        if (!cancelled) {
          reportError("screen", error);
          setScreenEnabled(false);
        }
      }
      if (cancelled) return;

      if (isConnected) {
        await renegotiateAllPeers();
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [micEnabled, camEnabled, screenEnabled, isClient, isConnected]);

  // Re-acquire mic when the selected device or audio processing settings
  // change. Do not require an existing track here: a second selection can
  // arrive while the previous getUserMedia request is still pending. Calling
  // disableMic invalidates that older generation so only the newest choice can
  // become live.
  useEffect(() => {
    if (!isClient || !micEnabled) return;
    let cancelled = false;

    (async () => {
      try {
        disableMic();
        await ensureMicEnabled();
        if (!cancelled && isConnected) await renegotiateAllPeers();
      } catch (error) {
        if (!cancelled) {
          reportError("mic", error);
          setMicEnabled(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    echoCancellationEnabled,
    noiseSuppressionEnabled,
    autoGainControlEnabled,
    audioInputId,
  ]);

  // Switching cameras while live should not require an off/on dance. The
  // selected track is replaced and every existing peer renegotiates once. As
  // with microphones, another selection can happen while acquisition is
  // pending, so the absence of a current track must not suppress the newest
  // request.
  useEffect(() => {
    if (!isClient || !camEnabled) return;
    let cancelled = false;

    (async () => {
      try {
        disableCam();
        await ensureCamEnabled();
        if (!cancelled && isConnected) await renegotiateAllPeers();
      } catch (error) {
        if (!cancelled) {
          reportError("cam", error);
          setCamEnabled(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoInputId]);

  // VAD (Voice Activity Detection)
  useEffect(() => {
    if (!isClient) return;
    const track = micTrackRef.current;
    if (!track) return;

    const start = () => {
      let audioContext: AudioContext;
      try {
        audioContext = new AudioContext();
      } catch {
        // Speaking highlights are optional. The microphone transmit gate is
        // applied outside this analyser path and remains safe without it.
        return;
      }
      let analyser: AnalyserNode;
      try {
        const stream = new MediaStream([track]);
        audioContextRef.current = audioContext;
        const source = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 1024;
        analyserRef.current = analyser;
        source.connect(analyser);
      } catch {
        audioContextRef.current = null;
        void audioContext.close().catch(() => undefined);
        return;
      }
      const data = new Uint8Array(analyser.fftSize);

      const threshold = 0.03;
      const hangMs = 450;

      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const sample = data[i] ?? 128;
          const v = (sample - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        const now = Date.now();
        if (rms > threshold) lastVoiceAtRef.current = now;
        const speakingRaw = now - lastVoiceAtRef.current < hangMs;

        const pttOk = !pushToTalkEnabled || pushToTalkDownRef.current;
        const speakingForTransmit = Boolean(speakingRaw && pttOk);

        if (speakingForTransmit !== lastSpeakingRef.current) {
          lastSpeakingRef.current = speakingForTransmit;
          setLocalSpeaking(speakingForTransmit);
          sendWebRTCSpeaking(speakingForTransmit);
        }

        vadRafRef.current = window.requestAnimationFrame(tick);
      };

      vadRafRef.current = window.requestAnimationFrame(tick);
    };

    start();

    return () => {
      if (vadRafRef.current) {
        window.cancelAnimationFrame(vadRafRef.current);
        vadRafRef.current = null;
      }
      try {
        analyserRef.current?.disconnect();
      } catch {
        // ignore
      }
      analyserRef.current = null;
      const ctx = audioContextRef.current;
      audioContextRef.current = null;
      if (ctx) {
        try {
          void ctx.close().catch(() => undefined);
        } catch {
          // ignore
        }
      }
    };
  }, [
    isClient,
    micEnabled,
    micTrackVersion,
    pushToTalkEnabled,
    pushToTalkDownRef,
    sendWebRTCSpeaking,
  ]);

  return {
    localStreamRef,
    localVideoRef,
    setLocalVideoElement,
    micTrackRef,
    camTrackRef,
    screenTrackRef,
    micEnabled,
    setMicEnabled,
    camEnabled,
    setCamEnabled,
    screenEnabled,
    setScreenEnabled,
    localSpeaking,
    mediaErrors,
    mediaPending,
    micTrackVersion,
    ensureLocalStream,
    disableMic,
    disableCam,
    disableScreen,
    applyPushToTalkGate,
    closePushToTalkGate,
    broadcastCurrentMediaState,
    broadcastCurrentSpeakingState,
    clearMediaError: clearError,
  };
}
