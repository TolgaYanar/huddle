import { useCallback, useEffect, useRef, useState } from "react";

interface UseMediaTracksProps {
  isClient: boolean;
  isConnected: boolean;
  userId: string;
  echoCancellationEnabled: boolean;
  noiseSuppressionEnabled: boolean;
  autoGainControlEnabled: boolean;
  pushToTalkEnabled: boolean;
  pushToTalkDownRef: React.MutableRefObject<boolean>;
  sendWebRTCMediaState: (state: {
    mic: boolean;
    cam: boolean;
    screen: boolean;
  }) => void;
  sendWebRTCSpeaking: (speaking: boolean) => void;
  renegotiateAllPeers: () => Promise<void>;
}

export function useMediaTracks({
  isClient,
  isConnected,
  userId,
  echoCancellationEnabled,
  noiseSuppressionEnabled,
  autoGainControlEnabled,
  pushToTalkEnabled,
  pushToTalkDownRef,
  sendWebRTCMediaState,
  sendWebRTCSpeaking,
  renegotiateAllPeers,
}: UseMediaTracksProps) {
  const localStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const micTrackRef = useRef<MediaStreamTrack | null>(null);
  const camTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const micRequestGenerationRef = useRef(0);
  const camRequestGenerationRef = useRef(0);
  const screenRequestGenerationRef = useRef(0);
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
  const [, setCamTrackVersion] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadRafRef = useRef<number | null>(null);
  const lastVoiceAtRef = useRef<number>(0);
  const lastSpeakingRef = useRef<boolean>(false);

  const ensureLocalStream = useCallback(() => {
    if (localStreamRef.current) return localStreamRef.current;
    if (typeof window === "undefined") return null;
    if (typeof MediaStream === "undefined") return null;
    localStreamRef.current = new MediaStream();
    return localStreamRef.current;
  }, []);

  const ensureMicEnabled = useCallback(async () => {
    if (micTrackRef.current) return true;
    // Reuse an in-flight request instead of racing a second one against it.
    const inFlight = micPendingRef.current;
    if (inFlight) return inFlight;
    const local = ensureLocalStream();
    if (!local) return false;
    const requestGeneration = ++micRequestGenerationRef.current;
    const request = (async () => {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: echoCancellationEnabled,
          noiseSuppression: noiseSuppressionEnabled,
          autoGainControl: autoGainControlEnabled,
        },
      });
      const track = stream.getAudioTracks()[0] ?? null;
      if (!track || requestGeneration !== micRequestGenerationRef.current) {
        stream.getTracks().forEach((streamTrack) => streamTrack.stop());
        return false;
      }
      stream
        .getTracks()
        .filter((streamTrack) => streamTrack !== track)
        .forEach((streamTrack) => streamTrack.stop());
      micTrackRef.current = track;
      local.addTrack(track);
      setMicTrackVersion((v) => v + 1);
      return true;
    })();
    micPendingRef.current = request;
    try {
      return await request;
    } finally {
      if (micPendingRef.current === request) micPendingRef.current = null;
    }
  }, [
    ensureLocalStream,
    echoCancellationEnabled,
    noiseSuppressionEnabled,
    autoGainControlEnabled,
  ]);

  const disableMic = useCallback(
    (skipStateUpdates = false) => {
      micRequestGenerationRef.current += 1;
      micPendingRef.current = null;
      const t = micTrackRef.current;
      if (t) {
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
      if (!skipStateUpdates) {
        setMicTrackVersion((v) => v + 1);
        setLocalSpeaking(false);
        sendWebRTCSpeaking(false);
      }
    },
    [sendWebRTCSpeaking],
  );

  const ensureCamEnabled = useCallback(async () => {
    if (camTrackRef.current) return true;
    // Reuse an in-flight request instead of racing a second one against it.
    const inFlight = camPendingRef.current;
    if (inFlight) return inFlight;
    const local = ensureLocalStream();
    if (!local) return false;
    const requestGeneration = ++camRequestGenerationRef.current;
    const request = (async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      const track = stream.getVideoTracks()[0] ?? null;
      if (!track || requestGeneration !== camRequestGenerationRef.current) {
        stream.getTracks().forEach((streamTrack) => streamTrack.stop());
        return false;
      }
      stream
        .getTracks()
        .filter((streamTrack) => streamTrack !== track)
        .forEach((streamTrack) => streamTrack.stop());
      camTrackRef.current = track;
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
      if (camPendingRef.current === request) camPendingRef.current = null;
    }
  }, [ensureLocalStream]);

  const disableCam = useCallback((skipStateUpdates = false) => {
    camRequestGenerationRef.current += 1;
    camPendingRef.current = null;
    const t = camTrackRef.current;
    if (t) {
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
    if (!skipStateUpdates) setCamTrackVersion((v) => v + 1);
  }, []);

  const ensureScreenEnabled = useCallback(async () => {
    if (screenTrackRef.current) return true;
    // Reuse an in-flight request instead of racing a second one against it.
    const inFlight = screenPendingRef.current;
    if (inFlight) return inFlight;
    const local = ensureLocalStream();
    if (!local) return false;
    const requestGeneration = ++screenRequestGenerationRef.current;
    const request = (async () => {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      const track = stream.getVideoTracks()[0] ?? null;
      if (!track || requestGeneration !== screenRequestGenerationRef.current) {
        stream.getTracks().forEach((streamTrack) => streamTrack.stop());
        return false;
      }

      screenStreamRef.current = stream;
      screenTrackRef.current = track;

      for (const vt of local.getVideoTracks()) {
        local.removeTrack(vt);
      }
      local.addTrack(track);

      track.onended = () => {
        setScreenEnabled(false);
      };
      return true;
    })();
    screenPendingRef.current = request;
    try {
      return await request;
    } finally {
      if (screenPendingRef.current === request) screenPendingRef.current = null;
    }
  }, [ensureLocalStream]);

  const disableScreen = useCallback(() => {
    screenRequestGenerationRef.current += 1;
    screenPendingRef.current = null;
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

    const camTrack = camTrackRef.current;
    if (camTrack) {
      try {
        localStreamRef.current?.addTrack(camTrack);
      } catch {
        // ignore
      }
    }
  }, []);

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
    };
  }, []);

  // Broadcast media state changes
  useEffect(() => {
    if (!isConnected || !userId) return;
    sendWebRTCMediaState({
      mic: micEnabled,
      cam: camEnabled,
      screen: screenEnabled,
    });
  }, [
    isConnected,
    userId,
    micEnabled,
    camEnabled,
    screenEnabled,
    sendWebRTCMediaState,
  ]);

  // Handle track toggles
  useEffect(() => {
    if (!isClient) return;
    let cancelled = false;

    (async () => {
      try {
        if (micEnabled) await ensureMicEnabled();
        else disableMic();
      } catch {
        if (!cancelled) setMicEnabled(false);
      }
      if (cancelled) return;

      try {
        if (camEnabled) await ensureCamEnabled();
        else disableCam();
      } catch {
        if (!cancelled) setCamEnabled(false);
      }
      if (cancelled) return;

      try {
        if (screenEnabled) await ensureScreenEnabled();
        else disableScreen();
      } catch {
        if (!cancelled) setScreenEnabled(false);
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

  // Re-acquire mic when audio processing settings change
  useEffect(() => {
    if (!isClient || !micEnabled || !micTrackRef.current) return;
    let cancelled = false;

    (async () => {
      try {
        disableMic(true);
        await ensureMicEnabled();
        if (!cancelled && isConnected) await renegotiateAllPeers();
      } catch {
        if (!cancelled) setMicEnabled(false);
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
  ]);

  // VAD (Voice Activity Detection)
  useEffect(() => {
    if (!isClient) return;
    const track = micTrackRef.current;
    if (!track) return;

    const start = async () => {
      const stream = new MediaStream([track]);
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      analyserRef.current = analyser;
      source.connect(analyser);
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

        track.enabled = Boolean(pttOk);

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
          ctx.close();
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
    micTrackVersion,
    ensureLocalStream,
    disableMic,
    disableCam,
    disableScreen,
  };
}
