import { useCallback } from "react";
import type { MutableRefObject } from "react";
import type { Socket } from "socket.io-client";

import type { WheelSpunData, WheelStateData } from "../types";

export function useWheelApi({
  roomId,
  socketRef,
  latestWheelStateRef,
  latestWheelSpunRef,
}: {
  roomId: string;
  socketRef: MutableRefObject<Socket | null>;
  latestWheelStateRef: MutableRefObject<WheelStateData | null>;
  latestWheelSpunRef: MutableRefObject<WheelSpunData | null>;
}) {
  const requestWheelState = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;
    if (!socket.connected) return;
    socket.emit("wheel_get", { roomId });
  }, [roomId, socketRef]);

  const addWheelEntry = useCallback(
    (text: string) => {
      const socket = socketRef.current;
      if (!socket) return;
      if (!socket.connected) return;
      socket.emit("wheel_add_entry", { roomId, text });
    },
    [roomId, socketRef],
  );

  const removeWheelEntry = useCallback(
    (index: number) => {
      const socket = socketRef.current;
      if (!socket) return;
      if (!socket.connected) return;
      socket.emit("wheel_remove_entry", { roomId, index });
    },
    [roomId, socketRef],
  );

  const clearWheelEntries = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;
    if (!socket.connected) return;
    socket.emit("wheel_clear", { roomId });
  }, [roomId, socketRef]);

  const spinWheel = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;
    if (!socket.connected) return;
    socket.emit("wheel_spin", { roomId });
  }, [roomId, socketRef]);

  const onWheelState = useCallback(
    (callback: (data: WheelStateData) => void) => {
      if (socketRef.current) {
        socketRef.current.on("wheel_state", callback);
      }

      const cached = latestWheelStateRef.current;
      if (cached && cached.roomId === roomId) {
        callback(cached);
      }

      return () => {
        if (socketRef.current) {
          socketRef.current.off("wheel_state", callback);
        }
      };
    },
    [latestWheelStateRef, roomId, socketRef],
  );

  const onWheelSpun = useCallback(
    (callback: (data: WheelSpunData) => void) => {
      if (socketRef.current) {
        socketRef.current.on("wheel_spun", callback);
      }

      const cached = latestWheelSpunRef.current;
      if (cached && cached.roomId === roomId) {
        callback(cached);
      }

      return () => {
        if (socketRef.current) {
          socketRef.current.off("wheel_spun", callback);
        }
      };
    },
    [latestWheelSpunRef, roomId, socketRef],
  );

  return {
    requestWheelState,
    addWheelEntry,
    removeWheelEntry,
    clearWheelEntries,
    spinWheel,
    onWheelState,
    onWheelSpun,
  };
}
