import { useCallback } from "react";
import type { MutableRefObject } from "react";
import type { Socket } from "socket.io-client";
import type { TimerStateData } from "../types";

export function useTimerApi({
  roomId,
  socketRef,
  latestTimerStateRef,
}: {
  roomId: string;
  socketRef: MutableRefObject<Socket | null>;
  latestTimerStateRef: MutableRefObject<TimerStateData | null>;
}) {
  const requestTimerState = useCallback(() => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    socket.emit("timer_get", { roomId });
  }, [roomId, socketRef]);

  const timerSetDuration = useCallback(
    (durationMs: number) => {
      const socket = socketRef.current;
      if (!socket?.connected) return;
      socket.emit("timer_set_duration", { roomId, durationMs });
    },
    [roomId, socketRef],
  );

  const timerStart = useCallback(() => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    socket.emit("timer_start", { roomId });
  }, [roomId, socketRef]);

  const timerPause = useCallback(() => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    socket.emit("timer_pause", { roomId });
  }, [roomId, socketRef]);

  const timerReset = useCallback(() => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    socket.emit("timer_reset", { roomId });
  }, [roomId, socketRef]);

  const onTimerState = useCallback(
    (callback: (data: TimerStateData) => void) => {
      if (socketRef.current) {
        socketRef.current.on("timer_state", callback);
      }
      const cached = latestTimerStateRef.current;
      if (cached && cached.roomId === roomId) {
        callback(cached);
      }
      return () => {
        if (socketRef.current) {
          socketRef.current.off("timer_state", callback);
        }
      };
    },
    [latestTimerStateRef, roomId, socketRef],
  );

  return {
    requestTimerState,
    timerSetDuration,
    timerStart,
    timerPause,
    timerReset,
    onTimerState,
  };
}
