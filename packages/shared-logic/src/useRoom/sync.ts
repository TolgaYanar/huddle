import { useCallback } from "react";
import type { MutableRefObject } from "react";
import type { Socket } from "socket.io-client";

import type { RoomStateData, SyncAction, SyncData } from "../types";

export type PendingSyncEvent = {
  action: SyncAction;
  timestamp: number;
  videoUrl?: string;
  volume?: number;
  isMuted?: boolean;
  playbackSpeed?: number;
  audioSyncEnabled?: boolean;
};

export function useSyncApi({
  roomId,
  socketRef,
  latestRoomStateRef,
  pendingSyncEventsRef,
}: {
  roomId: string;
  socketRef: MutableRefObject<Socket | null>;
  latestRoomStateRef: MutableRefObject<RoomStateData | null>;
  pendingSyncEventsRef: MutableRefObject<PendingSyncEvent[]>;
}) {
  const sendSyncEvent = useCallback(
    (
      action: SyncAction,
      timestamp: number,
      videoUrl?: string,
      extra?: Pick<
        SyncData,
        "volume" | "isMuted" | "playbackSpeed" | "audioSyncEnabled"
      >,
    ) => {
      const socket = socketRef.current;
      if (!socket) {
        console.log(`[SYNC-SEND] No socket available for action=${action}`);
        return;
      }

      if (!socket.connected) {
        console.log(
          `[SYNC-SEND] Socket not connected, queuing action=${action}`,
        );

        // Queue a small backlog to avoid losing the initial change_url.
        const q = pendingSyncEventsRef.current;
        q.push({ action, timestamp, videoUrl, ...extra });
        if (q.length > 10) q.shift();
        return;
      }

      socket.emit("sync_video", {
        roomId,
        action,
        timestamp,
        videoUrl,
        ...extra,
      });
    },
    [pendingSyncEventsRef, roomId, socketRef],
  );

  const onSyncEvent = useCallback(
    (callback: (data: SyncData) => void) => {
      if (socketRef.current) {
        socketRef.current.on("receive_sync", callback);
      }

      return () => {
        if (socketRef.current) {
          socketRef.current.off("receive_sync", callback);
        }
      };
    },
    [socketRef],
  );

  const onRoomState = useCallback(
    (callback: (data: RoomStateData) => void) => {
      if (socketRef.current) {
        socketRef.current.on("room_state", callback);
      }

      // Immediately provide cached state (avoids races with initial join push).
      const cached = latestRoomStateRef.current;
      if (cached && cached.roomId === roomId) {
        callback(cached);
      }

      return () => {
        if (socketRef.current) {
          socketRef.current.off("room_state", callback);
        }
      };
    },
    [latestRoomStateRef, roomId, socketRef],
  );

  const requestRoomState = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;
    if (!socket.connected) return;
    socket.emit("request_room_state", roomId);
  }, [roomId, socketRef]);

  return {
    sendSyncEvent,
    onSyncEvent,
    onRoomState,
    requestRoomState,
  };
}
