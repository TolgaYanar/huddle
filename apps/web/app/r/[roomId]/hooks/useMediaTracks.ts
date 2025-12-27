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
    if (micTrackRef.current) return;
    const local = ensureLocalStream();
    if (!local) return;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: echoCancellationEnabled,
        noiseSuppression: noiseSuppressionEnabled,
        autoGainControl: autoGainControlEnabled,
      },
    });
    const track = stream.getAudioTracks()[0] ?? null;
    if (!track) return;
    micTrackRef.current = track;
    local.addTrack(track);
    setMicTrackVersion((v) => v + 1);
  }, [
    ensureLocalStream,
    echoCancellationEnabled,
    noiseSuppressionEnabled,
    autoGainControlEnabled,
  ]);

  const disableMic = useCallback(
    (skipStateUpdates = false) => {
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
    [sendWebRTCSpeaking]
  );

  const ensureCamEnabled = useCallback(async () => {
    if (camTrackRef.current) return;
    const local = ensureLocalStream();
    if (!local) return;
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    const track = stream.getVideoTracks()[0] ?? null;
    if (!track) return;
    camTrackRef.current = track;
    setCamTrackVersion((v) => v + 1);
    if (!screenTrackRef.current) {
      local.addTrack(track);
    }
  }, [ensureLocalStream]);

  const disableCam = useCallback((skipStateUpdates = false) => {
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
    if (screenTrackRef.current) return;
    const local = ensureLocalStream();
    if (!local) return;
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false,
    });
    const track = stream.getVideoTracks()[0] ?? null;
    if (!track) return;

    screenStreamRef.current = stream;
    screenTrackRef.current = track;

    for (const vt of local.getVideoTracks()) {
      local.removeTrack(vt);
    }
    local.addTrack(track);

    track.onended = () => {
      setScreenEnabled(false);
    };
  }, [ensureLocalStream]);

  const disableScreen = useCallback(() => {
    const t = screenTrackRef.current;
    const s = screenStreamRef.current;

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

  // Attach local stream to video element
  useEffect(() => {
    if (!isClient) return;
    if (!localVideoRef.current) return;
    const s = ensureLocalStream();
    if (!s) return;
    localVideoRef.current.srcObject = s;
  }, [isClient, ensureLocalStream]);

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

    (async () => {
      try {
        if (micEnabled) await ensureMicEnabled();
        else disableMic();
      } catch {
        setMicEnabled(false);
      }

      try {
        if (camEnabled) await ensureCamEnabled();
        else disableCam();
      } catch {
        setCamEnabled(false);
      }

      try {
        if (screenEnabled) await ensureScreenEnabled();
        else disableScreen();
      } catch {
        setScreenEnabled(false);
      }

      if (isConnected) {
        await renegotiateAllPeers();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [micEnabled, camEnabled, screenEnabled, isClient, isConnected]);

  // Re-acquire mic when audio processing settings change
  useEffect(() => {
    if (!isClient || !micEnabled || !micTrackRef.current) return;

    (async () => {
      try {
        disableMic(true);
        await ensureMicEnabled();
        if (isConnected) await renegotiateAllPeers();
      } catch {
        setMicEnabled(false);
      }
    })();
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
