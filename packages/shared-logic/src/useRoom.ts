import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

import { SERVER_URL } from "./serverUrl";
import type {
  ActivityHistoryData,
  ChatHistoryData,
  PlaylistStateData,
  RoomPasswordRequiredData,
  RoomPasswordStatusData,
  RoomStateData,
  RoomUsersData,
  WheelSpunData,
  WheelStateData,
} from "./types";
import { useActivityApi } from "./useRoom/activity";
import { useChatApi } from "./useRoom/chat";
import { usePlaylistsApi } from "./useRoom/playlists";
import { type PendingSyncEvent, useSyncApi } from "./useRoom/sync";
import { useUsersApi } from "./useRoom/users";
import { useWebRtcApi } from "./useRoom/webrtc";
import { useWheelApi } from "./useRoom/wheel";

export const useRoom = (roomId: string, userId: string) => {
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  const latestRoomStateRef = useRef<RoomStateData | null>(null);
  const latestChatHistoryRef = useRef<ChatHistoryData | null>(null);
  const latestActivityHistoryRef = useRef<ActivityHistoryData | null>(null);
  const latestRoomUsersRef = useRef<RoomUsersData | null>(null);
  const latestRoomPasswordStatusRef = useRef<RoomPasswordStatusData | null>(
    null,
  );
  const latestRoomPasswordRequiredRef = useRef<RoomPasswordRequiredData | null>(
    null,
  );
  const latestWheelStateRef = useRef<WheelStateData | null>(null);
  const latestWheelSpunRef = useRef<WheelSpunData | null>(null);
  const latestPlaylistStateRef = useRef<PlaylistStateData | null>(null);

  const pendingSyncEventsRef = useRef<PendingSyncEvent[]>([]);

  useEffect(() => {
    const isSameOrigin =
      typeof window !== "undefined" && SERVER_URL === window.location.origin;

    socketRef.current = io(SERVER_URL, {
      // When using same-origin (typically via Vercel rewrites), websocket
      // upgrades can be unreliable; polling-only is the safe default.
      // When connecting directly to the backend (e.g. https://api.wehuddle.tv),
      // websocket works as expected and provides lower latency.
      transports: isSameOrigin ? ["polling"] : ["websocket", "polling"],
      upgrade: !isSameOrigin,
      autoConnect: false,
      withCredentials: true,
      path: "/socket.io/",
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 20000,
    });

    const socket = socketRef.current;

    const clearCachedRoomData = () => {
      latestRoomStateRef.current = null;
      latestChatHistoryRef.current = null;
      latestActivityHistoryRef.current = null;
      latestRoomUsersRef.current = null;
      latestRoomPasswordStatusRef.current = null;
      latestRoomPasswordRequiredRef.current = null;
      latestWheelStateRef.current = null;
      latestWheelSpunRef.current = null;
      latestPlaylistStateRef.current = null;
    };

    const handleRoomState = (data: RoomStateData) => {
      latestRoomStateRef.current = data;
    };

    const handleChatHistory = (data: ChatHistoryData) => {
      latestChatHistoryRef.current = data;
    };

    const handleActivityHistory = (data: ActivityHistoryData) => {
      latestActivityHistoryRef.current = data;
    };

    const handleRoomUsers = (data: RoomUsersData) => {
      latestRoomUsersRef.current = data;
      // If we received room users, join succeeded; any previous password-required is obsolete.
      latestRoomPasswordRequiredRef.current = null;
    };

    const handleRoomPasswordStatus = (data: RoomPasswordStatusData) => {
      latestRoomPasswordStatusRef.current = data;
      // Status implies join succeeded; clear any previous required/invalid state.
      latestRoomPasswordRequiredRef.current = null;
    };

    const handleRoomPasswordRequired = (data: RoomPasswordRequiredData) => {
      latestRoomPasswordRequiredRef.current = data;
    };

    const handleWheelState = (data: WheelStateData) => {
      latestWheelStateRef.current = data;
    };

    const handleWheelSpun = (data: WheelSpunData) => {
      latestWheelSpunRef.current = data;
    };

    const handlePlaylistState = (data: PlaylistStateData) => {
      latestPlaylistStateRef.current = data;
    };

    // Always listen for room state so we don't miss the first push during join.
    socket.on("room_state", handleRoomState);
    socket.on("chat_history", handleChatHistory);
    socket.on("activity_history", handleActivityHistory);
    socket.on("room_users", handleRoomUsers);
    socket.on("room_password_status", handleRoomPasswordStatus);
    socket.on("room_requires_password", handleRoomPasswordRequired);
    socket.on("wheel_state", handleWheelState);
    socket.on("wheel_spun", handleWheelSpun);
    socket.on("playlist_state", handlePlaylistState);

    socket.on("connect_error", (err) => {
      console.error("Socket connect_error:", err?.message || err);
      console.error("Connection details:", {
        url: SERVER_URL,
        transport: socket.io.engine?.transport?.name,
        readyState: socket.io.engine?.readyState,
      });
    });

    socket.io.on("error", (error) => {
      console.error("Socket.IO engine error:", error);
    });

    socket.io.on("reconnect_attempt", (attempt) => {
      console.log(`Socket reconnection attempt ${attempt}...`);
    });

    socket.io.on("reconnect_failed", () => {
      console.error("Socket reconnection failed after all attempts");
    });

    socket.off("disconnect");
    socket.on("disconnect", () => {
      console.log("Disconnected from socket server");
      setIsConnected(false);
      // Avoid stale cached room/users/password data showing up while disconnected or on the next reconnect.
      clearCachedRoomData();
    });

    socket.on("connect", () => {
      console.log("Connected to socket server");
      setIsConnected(true);
      // New connection => drop any cached events from a previous socket id.
      clearCachedRoomData();

      // Join the room immediately upon connection (if password exists in session storage, include it).
      let password;
      try {
        password =
          typeof window !== "undefined"
            ? window.sessionStorage.getItem(`huddle:roomPassword:${roomId}`)
            : null;
      } catch {
        password = null;
      }

      socket.emit("join_room", {
        roomId,
        password: password || undefined,
      });

      // Flush any events the user triggered before we connected.
      const pending = pendingSyncEventsRef.current;
      if (pending.length > 0) {
        pending.forEach((evt) => {
          socket.emit("sync_video", {
            roomId,
            action: evt.action,
            timestamp: evt.timestamp,
            videoUrl: evt.videoUrl,
            volume: evt.volume,
            isMuted: evt.isMuted,
            playbackSpeed: evt.playbackSpeed,
          });
        });
        pendingSyncEventsRef.current = [];
      }
    });

    socket.connect();

    return () => {
      socket.off("room_state", handleRoomState);
      socket.off("chat_history", handleChatHistory);
      socket.off("activity_history", handleActivityHistory);
      socket.off("room_users", handleRoomUsers);
      socket.off("room_password_status", handleRoomPasswordStatus);
      socket.off("room_requires_password", handleRoomPasswordRequired);
      socket.off("wheel_state", handleWheelState);
      socket.off("wheel_spun", handleWheelSpun);
      socket.off("playlist_state", handlePlaylistState);

      // Best-effort: tell server we left the room so others update immediately.
      try {
        socket.emit("leave_room", { roomId });
      } catch {
        // ignore
      }

      socket.disconnect();
    };
  }, [roomId]);

  const usersApi = useUsersApi({
    roomId,
    socketRef,
    latestRoomUsersRef,
    latestRoomPasswordStatusRef,
    latestRoomPasswordRequiredRef,
  });

  const wheelApi = useWheelApi({
    roomId,
    socketRef,
    latestWheelStateRef,
    latestWheelSpunRef,
  });

  const syncApi = useSyncApi({
    roomId,
    socketRef,
    latestRoomStateRef,
    pendingSyncEventsRef,
  });

  const chatApi = useChatApi({
    roomId,
    socketRef,
    latestChatHistoryRef,
  });

  const activityApi = useActivityApi({
    roomId,
    socketRef,
    latestActivityHistoryRef,
  });

  const webrtcApi = useWebRtcApi({ roomId, socketRef });

  const playlistsApi = usePlaylistsApi({
    roomId,
    socketRef,
    latestPlaylistStateRef,
  });

  return {
    isConnected,
    ...usersApi,
    ...wheelApi,
    ...syncApi,
    ...chatApi,
    ...activityApi,
    ...webrtcApi,
    ...playlistsApi,
    socket: socketRef.current,
  };
};
