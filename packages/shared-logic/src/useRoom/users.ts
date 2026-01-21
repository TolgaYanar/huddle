import { useCallback } from "react";
import type { MutableRefObject } from "react";
import type { Socket } from "socket.io-client";

import type {
  RoomPasswordRequiredData,
  RoomPasswordStatusData,
  RoomUsersData,
  UserPresenceData,
} from "../types";

export function useUsersApi({
  roomId,
  socketRef,
  latestRoomUsersRef,
  latestRoomPasswordStatusRef,
  latestRoomPasswordRequiredRef,
}: {
  roomId: string;
  socketRef: MutableRefObject<Socket | null>;
  latestRoomUsersRef: MutableRefObject<RoomUsersData | null>;
  latestRoomPasswordStatusRef: MutableRefObject<RoomPasswordStatusData | null>;
  latestRoomPasswordRequiredRef: MutableRefObject<RoomPasswordRequiredData | null>;
}) {
  const joinRoom = useCallback(
    (password?: string) => {
      const socket = socketRef.current;
      if (!socket) return;
      if (!socket.connected) return;
      socket.emit("join_room", { roomId, password: password || undefined });
    },
    [roomId, socketRef],
  );

  const setRoomPassword = useCallback(
    (password: string) => {
      const socket = socketRef.current;
      if (!socket) return;
      if (!socket.connected) return;
      socket.emit("set_room_password", { roomId, password });
    },
    [roomId, socketRef],
  );

  const onRoomUsers = useCallback(
    (callback: (data: RoomUsersData) => void) => {
      if (socketRef.current) {
        socketRef.current.on("room_users", callback);
      }

      const cached = latestRoomUsersRef.current;
      if (cached && cached.roomId === roomId) {
        callback(cached);
      }

      return () => {
        if (socketRef.current) {
          socketRef.current.off("room_users", callback);
        }
      };
    },
    [latestRoomUsersRef, roomId, socketRef],
  );

  const onRoomPasswordStatus = useCallback(
    (callback: (data: RoomPasswordStatusData) => void) => {
      if (socketRef.current) {
        socketRef.current.on("room_password_status", callback);
      }

      const cached = latestRoomPasswordStatusRef.current;
      if (cached && cached.roomId === roomId) {
        callback(cached);
      }

      return () => {
        if (socketRef.current) {
          socketRef.current.off("room_password_status", callback);
        }
      };
    },
    [latestRoomPasswordStatusRef, roomId, socketRef],
  );

  const onRoomPasswordRequired = useCallback(
    (callback: (data: RoomPasswordRequiredData) => void) => {
      if (socketRef.current) {
        socketRef.current.on("room_requires_password", callback);
      }

      const cached = latestRoomPasswordRequiredRef.current;
      if (cached && cached.roomId === roomId) {
        callback(cached);
      }

      return () => {
        if (socketRef.current) {
          socketRef.current.off("room_requires_password", callback);
        }
      };
    },
    [latestRoomPasswordRequiredRef, roomId, socketRef],
  );

  const onUserJoined = useCallback(
    (callback: (data: UserPresenceData) => void) => {
      if (socketRef.current) {
        socketRef.current.on("user_joined", callback);
      }
      return () => {
        if (socketRef.current) {
          socketRef.current.off("user_joined", callback);
        }
      };
    },
    [socketRef],
  );

  const onUserLeft = useCallback(
    (callback: (data: UserPresenceData) => void) => {
      if (socketRef.current) {
        socketRef.current.on("user_left", callback);
      }
      return () => {
        if (socketRef.current) {
          socketRef.current.off("user_left", callback);
        }
      };
    },
    [socketRef],
  );

  return {
    joinRoom,
    setRoomPassword,
    onRoomUsers,
    onRoomPasswordStatus,
    onRoomPasswordRequired,
    onUserJoined,
    onUserLeft,
  };
}
