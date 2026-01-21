import { useCallback } from "react";
import type { MutableRefObject } from "react";
import type { Socket } from "socket.io-client";

import type { WebRTCMediaState } from "../types";

export function useWebRtcApi({
  roomId,
  socketRef,
}: {
  roomId: string;
  socketRef: MutableRefObject<Socket | null>;
}) {
  const sendWebRTCOffer = useCallback(
    (to: string, sdp: unknown) => {
      const socket = socketRef.current;
      if (!socket) return;
      if (!socket.connected) return;
      socket.emit("webrtc_offer", { roomId, to, sdp });
    },
    [roomId, socketRef],
  );

  const sendWebRTCAnswer = useCallback(
    (to: string, sdp: unknown) => {
      const socket = socketRef.current;
      if (!socket) return;
      if (!socket.connected) return;
      socket.emit("webrtc_answer", { roomId, to, sdp });
    },
    [roomId, socketRef],
  );

  const sendWebRTCIce = useCallback(
    (to: string, candidate: unknown) => {
      const socket = socketRef.current;
      if (!socket) return;
      if (!socket.connected) return;
      socket.emit("webrtc_ice", { roomId, to, candidate });
    },
    [roomId, socketRef],
  );

  const onWebRTCOffer = useCallback(
    (
      callback: (data: { roomId: string; from: string; sdp: unknown }) => void,
    ) => {
      if (socketRef.current) {
        socketRef.current.on("webrtc_offer", callback);
      }
      return () => {
        if (socketRef.current) {
          socketRef.current.off("webrtc_offer", callback);
        }
      };
    },
    [socketRef],
  );

  const onWebRTCAnswer = useCallback(
    (
      callback: (data: { roomId: string; from: string; sdp: unknown }) => void,
    ) => {
      if (socketRef.current) {
        socketRef.current.on("webrtc_answer", callback);
      }
      return () => {
        if (socketRef.current) {
          socketRef.current.off("webrtc_answer", callback);
        }
      };
    },
    [socketRef],
  );

  const onWebRTCIce = useCallback(
    (
      callback: (data: {
        roomId: string;
        from: string;
        candidate: unknown;
      }) => void,
    ) => {
      if (socketRef.current) {
        socketRef.current.on("webrtc_ice", callback);
      }
      return () => {
        if (socketRef.current) {
          socketRef.current.off("webrtc_ice", callback);
        }
      };
    },
    [socketRef],
  );

  const sendWebRTCMediaState = useCallback(
    (state: WebRTCMediaState) => {
      const socket = socketRef.current;
      if (!socket) return;
      if (!socket.connected) return;
      socket.emit("webrtc_media_state", { roomId, state });
    },
    [roomId, socketRef],
  );

  const onWebRTCMediaState = useCallback(
    (
      callback: (data: {
        roomId: string;
        from: string;
        state: WebRTCMediaState;
      }) => void,
    ) => {
      if (socketRef.current) {
        socketRef.current.on("webrtc_media_state", callback);
      }
      return () => {
        if (socketRef.current) {
          socketRef.current.off("webrtc_media_state", callback);
        }
      };
    },
    [socketRef],
  );

  const sendWebRTCSpeaking = useCallback(
    (speaking: boolean) => {
      const socket = socketRef.current;
      if (!socket) return;
      if (!socket.connected) return;
      socket.emit("webrtc_speaking", { roomId, speaking });
    },
    [roomId, socketRef],
  );

  const onWebRTCSpeaking = useCallback(
    (
      callback: (data: {
        roomId: string;
        from: string;
        speaking: boolean;
      }) => void,
    ) => {
      if (socketRef.current) {
        socketRef.current.on("webrtc_speaking", callback);
      }
      return () => {
        if (socketRef.current) {
          socketRef.current.off("webrtc_speaking", callback);
        }
      };
    },
    [socketRef],
  );

  return {
    sendWebRTCOffer,
    sendWebRTCAnswer,
    sendWebRTCIce,
    onWebRTCOffer,
    onWebRTCAnswer,
    onWebRTCIce,
    sendWebRTCMediaState,
    onWebRTCMediaState,
    sendWebRTCSpeaking,
    onWebRTCSpeaking,
  };
}
