import { useCallback } from "react";
import type { MutableRefObject } from "react";
import type { Socket } from "socket.io-client";

import type { ActivityEvent, ActivityHistoryData } from "../types";

export function useActivityApi({
  roomId,
  socketRef,
  latestActivityHistoryRef,
}: {
  roomId: string;
  socketRef: MutableRefObject<Socket | null>;
  latestActivityHistoryRef: MutableRefObject<ActivityHistoryData | null>;
}) {
  const onActivityEvent = useCallback(
    (callback: (evt: ActivityEvent) => void) => {
      if (socketRef.current) {
        socketRef.current.on("activity_event", callback);
      }
      return () => {
        if (socketRef.current) {
          socketRef.current.off("activity_event", callback);
        }
      };
    },
    [socketRef],
  );

  const onActivityHistory = useCallback(
    (callback: (data: ActivityHistoryData) => void) => {
      if (socketRef.current) {
        socketRef.current.on("activity_history", callback);
      }

      const cached = latestActivityHistoryRef.current;
      if (cached && cached.roomId === roomId) {
        callback(cached);
      }

      return () => {
        if (socketRef.current) {
          socketRef.current.off("activity_history", callback);
        }
      };
    },
    [latestActivityHistoryRef, roomId, socketRef],
  );

  const requestActivityHistory = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;
    if (!socket.connected) return;
    socket.emit("request_activity_history", roomId);
  }, [roomId, socketRef]);

  return {
    onActivityEvent,
    onActivityHistory,
    requestActivityHistory,
  };
}
