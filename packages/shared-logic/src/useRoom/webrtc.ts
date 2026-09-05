import { useCallback } from "react";
import type { MutableRefObject } from "react";
import type { Socket } from "socket.io-client";

import type { WebRTCMediaState } from "../types";
import type { BufferedEventChannel } from "./bufferedEvent";

export type WebRTCOfferData = {
  roomId: string;
  from: string;
  sdp: unknown;
};

export type WebRTCIceData = {
  roomId: string;
  from: string;
  candidate: unknown;
};

export type WebRTCMediaStateData = {
  roomId: string;
  from: string;
  state: WebRTCMediaState;
};

export type WebRTCSpeakingData = {
  roomId: string;
  from: string;
  speaking: boolean;
};

export type WebRtcEventChannels = {
  offer: BufferedEventChannel<WebRTCOfferData>;
  answer: BufferedEventChannel<WebRTCOfferData>;
  ice: BufferedEventChannel<WebRTCIceData>;
  mediaState: BufferedEventChannel<WebRTCMediaStateData>;
  speaking: BufferedEventChannel<WebRTCSpeakingData>;
};

export function useWebRtcApi({
  roomId,
  socketRef,
  eventChannels,
}: {
  roomId: string;
  socketRef: MutableRefObject<Socket | null>;
  eventChannels: WebRtcEventChannels;
}) {
  const sendWebRTCOffer = useCallback(
    (to: string, sdp: unknown) => {
      const socket = socketRef.current;
      if (!socket?.connected) return false;
      socket.emit("webrtc_offer", { roomId, to, sdp });
      return true;
    },
    [roomId, socketRef],
  );

  const sendWebRTCAnswer = useCallback(
    (to: string, sdp: unknown) => {
      const socket = socketRef.current;
      if (!socket?.connected) return false;
      socket.emit("webrtc_answer", { roomId, to, sdp });
      return true;
    },
    [roomId, socketRef],
  );

  const sendWebRTCIce = useCallback(
    (to: string, candidate: unknown) => {
      const socket = socketRef.current;
      if (!socket?.connected) return false;
      socket.emit("webrtc_ice", { roomId, to, candidate });
      return true;
    },
    [roomId, socketRef],
  );

  const onWebRTCOffer = useCallback(
    (callback: (data: WebRTCOfferData) => void | Promise<void>) =>
      eventChannels.offer.subscribe(callback),
    [eventChannels],
  );

  const onWebRTCAnswer = useCallback(
    (callback: (data: WebRTCOfferData) => void | Promise<void>) =>
      eventChannels.answer.subscribe(callback),
    [eventChannels],
  );

  const onWebRTCIce = useCallback(
    (callback: (data: WebRTCIceData) => void | Promise<void>) =>
      eventChannels.ice.subscribe(callback),
    [eventChannels],
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
    (callback: (data: WebRTCMediaStateData) => void) =>
      eventChannels.mediaState.subscribe(callback),
    [eventChannels],
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
    (callback: (data: WebRTCSpeakingData) => void) =>
      eventChannels.speaking.subscribe(callback),
    [eventChannels],
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
