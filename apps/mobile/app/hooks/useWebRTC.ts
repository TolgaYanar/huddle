import { useCallback, useEffect, useRef, useState } from "react";
import {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  mediaDevices,
  MediaStream,
  MediaStreamTrack,
} from "react-native-webrtc";
import type { Socket } from "socket.io-client";

interface RemoteStreamEntry {
  id: string;
  stream: MediaStream;
}

interface WebRTCMediaState {
  mic: boolean;
  cam: boolean;
}

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export function useWebRTC({
  socket,
  roomId,
  userId,
  isConnected,
}: {
  socket: Socket | null;
  roomId: string;
  userId: string;
  isConnected: boolean;
}) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<RemoteStreamEntry[]>([]);
  const [micEnabled, setMicEnabled] = useState(false);
  const [camEnabled, setCamEnabled] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [remoteSpeaking, setRemoteSpeaking] = useState<Record<string, boolean>>(
    {}
  );
  const [remoteMedia, setRemoteMedia] = useState<
    Record<string, WebRTCMediaState>
  >({});

  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);

  // Get local media stream
  const startLocalStream = useCallback(
    async (audio: boolean = true, video: boolean = false) => {
      try {
        const stream = await mediaDevices.getUserMedia({
          audio: audio
            ? {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              }
            : false,
          video: video
            ? {
                facingMode: "user",
                width: { ideal: 640 },
                height: { ideal: 480 },
              }
            : false,
        });

        localStreamRef.current = stream;
        setLocalStream(stream);
        setMicEnabled(audio);
        setCamEnabled(video);

        // Add tracks to existing peers
        peersRef.current.forEach((pc) => {
          stream.getTracks().forEach((track) => {
            pc.addTrack(track, stream);
          });
        });

        return stream;
      } catch (error) {
        console.error("Error getting local stream:", error);
        return null;
      }
    },
    []
  );

  // Stop local stream
  const stopLocalStream = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      setLocalStream(null);
      setMicEnabled(false);
      setCamEnabled(false);
    }
  }, []);

  // Toggle microphone
  const toggleMic = useCallback(async () => {
    if (!localStreamRef.current) {
      // Start stream with audio only
      await startLocalStream(true, camEnabled);
      return;
    }

    const audioTracks = localStreamRef.current.getAudioTracks();
    if (audioTracks.length > 0) {
      const enabled = !audioTracks[0].enabled;
      audioTracks.forEach((track) => (track.enabled = enabled));
      setMicEnabled(enabled);

      // Notify others of media state
      socket?.emit("webrtc_media_state", {
        roomId,
        state: { mic: enabled, cam: camEnabled },
      });
    }
  }, [socket, roomId, camEnabled, startLocalStream]);

  // Toggle camera
  const toggleCam = useCallback(async () => {
    if (!localStreamRef.current) {
      await startLocalStream(micEnabled, true);
      return;
    }

    const videoTracks = localStreamRef.current.getVideoTracks();
    if (videoTracks.length > 0) {
      const enabled = !videoTracks[0].enabled;
      videoTracks.forEach((track) => (track.enabled = enabled));
      setCamEnabled(enabled);

      socket?.emit("webrtc_media_state", {
        roomId,
        state: { mic: micEnabled, cam: enabled },
      });
    } else if (!camEnabled) {
      // Need to add video track
      try {
        const videoStream = await mediaDevices.getUserMedia({
          video: { facingMode: "user", width: 640, height: 480 },
        });
        const videoTrack = videoStream.getVideoTracks()[0];
        localStreamRef.current.addTrack(videoTrack);
        setCamEnabled(true);

        // Add to peers
        peersRef.current.forEach((pc) => {
          pc.addTrack(videoTrack, localStreamRef.current!);
        });

        socket?.emit("webrtc_media_state", {
          roomId,
          state: { mic: micEnabled, cam: true },
        });
      } catch (error) {
        console.error("Error adding video track:", error);
      }
    }
  }, [socket, roomId, micEnabled, startLocalStream]);

  // Create peer connection
  const createPeerConnection = useCallback(
    (peerId: string): RTCPeerConnection => {
      const pc = new RTCPeerConnection(ICE_SERVERS);

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket?.emit("webrtc_ice", {
            roomId,
            to: peerId,
            candidate: event.candidate,
          });
        }
      };

      pc.ontrack = (event) => {
        const stream = event.streams[0];
        if (stream) {
          remoteStreamsRef.current.set(peerId, stream);
          setRemoteStreams(
            Array.from(remoteStreamsRef.current.entries()).map(([id, s]) => ({
              id,
              stream: s,
            }))
          );
        }
      };

      pc.onconnectionstatechange = () => {
        if (
          pc.connectionState === "disconnected" ||
          pc.connectionState === "failed"
        ) {
          closePeer(peerId);
        }
      };

      // Add local tracks
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current!);
        });
      }

      peersRef.current.set(peerId, pc);
      return pc;
    },
    [socket, roomId]
  );

  // Close peer connection
  const closePeer = useCallback((peerId: string) => {
    const pc = peersRef.current.get(peerId);
    if (pc) {
      pc.close();
      peersRef.current.delete(peerId);
    }
    remoteStreamsRef.current.delete(peerId);
    setRemoteStreams(
      Array.from(remoteStreamsRef.current.entries()).map(([id, s]) => ({
        id,
        stream: s,
      }))
    );
    setRemoteSpeaking((prev) => {
      const next = { ...prev };
      delete next[peerId];
      return next;
    });
    setRemoteMedia((prev) => {
      const next = { ...prev };
      delete next[peerId];
      return next;
    });
  }, []);

  // Send offer to peer
  const sendOffer = useCallback(
    async (peerId: string) => {
      let pc = peersRef.current.get(peerId);
      if (!pc) {
        pc = createPeerConnection(peerId);
      }

      try {
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        });
        await pc.setLocalDescription(offer);

        socket?.emit("webrtc_offer", {
          roomId,
          to: peerId,
          sdp: offer,
        });
      } catch (error) {
        console.error("Error creating offer:", error);
      }
    },
    [socket, roomId, createPeerConnection]
  );

  // Handle incoming offer
  const handleOffer = useCallback(
    async (from: string, sdp: RTCSessionDescription) => {
      let pc = peersRef.current.get(from);
      if (!pc) {
        pc = createPeerConnection(from);
      }

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket?.emit("webrtc_answer", {
          roomId,
          to: from,
          sdp: answer,
        });
      } catch (error) {
        console.error("Error handling offer:", error);
      }
    },
    [socket, roomId, createPeerConnection]
  );

  // Handle incoming answer
  const handleAnswer = useCallback(
    async (from: string, sdp: RTCSessionDescription) => {
      const pc = peersRef.current.get(from);
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        } catch (error) {
          console.error("Error handling answer:", error);
        }
      }
    },
    []
  );

  // Handle incoming ICE candidate
  const handleIceCandidate = useCallback(
    async (from: string, candidate: RTCIceCandidate) => {
      const pc = peersRef.current.get(from);
      if (pc) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
          console.error("Error adding ICE candidate:", error);
        }
      }
    },
    []
  );

  // Close all peers
  const closeAllPeers = useCallback(() => {
    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();
    remoteStreamsRef.current.clear();
    setRemoteStreams([]);
    setRemoteSpeaking({});
    setRemoteMedia({});
  }, []);

  // Socket event listeners
  useEffect(() => {
    if (!socket || !isConnected) return;

    const handleRoomUsers = (data: { users: string[] }) => {
      // Connect to new peers
      data.users.forEach((peerId) => {
        if (peerId !== userId && !peersRef.current.has(peerId)) {
          sendOffer(peerId);
        }
      });
    };

    const handleUserJoined = (peerId: string) => {
      if (peerId !== userId) {
        sendOffer(peerId);
      }
    };

    const handleUserLeft = (peerId: string) => {
      closePeer(peerId);
    };

    const handleWebRTCOffer = (data: { from: string; sdp: any }) => {
      if (data.from !== userId) {
        handleOffer(data.from, data.sdp);
      }
    };

    const handleWebRTCAnswer = (data: { from: string; sdp: any }) => {
      if (data.from !== userId) {
        handleAnswer(data.from, data.sdp);
      }
    };

    const handleWebRTCIce = (data: { from: string; candidate: any }) => {
      if (data.from !== userId) {
        handleIceCandidate(data.from, data.candidate);
      }
    };

    const handleMediaState = (data: {
      from: string;
      state: WebRTCMediaState;
    }) => {
      setRemoteMedia((prev) => ({
        ...prev,
        [data.from]: data.state,
      }));
    };

    const handleSpeaking = (data: { from: string; speaking: boolean }) => {
      setRemoteSpeaking((prev) => ({
        ...prev,
        [data.from]: data.speaking,
      }));
    };

    socket.on("room_users", handleRoomUsers);
    socket.on("user_joined", handleUserJoined);
    socket.on("user_left", handleUserLeft);
    socket.on("webrtc_offer", handleWebRTCOffer);
    socket.on("webrtc_answer", handleWebRTCAnswer);
    socket.on("webrtc_ice", handleWebRTCIce);
    socket.on("webrtc_media_state", handleMediaState);
    socket.on("webrtc_speaking", handleSpeaking);

    return () => {
      socket.off("room_users", handleRoomUsers);
      socket.off("user_joined", handleUserJoined);
      socket.off("user_left", handleUserLeft);
      socket.off("webrtc_offer", handleWebRTCOffer);
      socket.off("webrtc_answer", handleWebRTCAnswer);
      socket.off("webrtc_ice", handleWebRTCIce);
      socket.off("webrtc_media_state", handleMediaState);
      socket.off("webrtc_speaking", handleSpeaking);
    };
  }, [
    socket,
    isConnected,
    userId,
    sendOffer,
    closePeer,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      closeAllPeers();
      stopLocalStream();
    };
  }, [closeAllPeers, stopLocalStream]);

  return {
    localStream,
    remoteStreams,
    micEnabled,
    camEnabled,
    isSpeaking,
    remoteSpeaking,
    remoteMedia,
    startLocalStream,
    stopLocalStream,
    toggleMic,
    toggleCam,
    closeAllPeers,
  };
}
