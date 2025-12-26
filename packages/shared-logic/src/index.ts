import { useCallback, useEffect, useState, useRef } from "react";
import { io, Socket } from "socket.io-client";

// Define types for our sync events
export type SyncAction = "play" | "pause" | "seek" | "change_url";

export interface SyncData {
  roomId: string;
  action: SyncAction;
  timestamp: number;
  videoUrl?: string;
  senderId?: string;
}

export interface RoomStateData {
  roomId: string;
  videoUrl?: string;
  timestamp?: number;
  action?: SyncAction;
  updatedAt?: number;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  text: string;
  createdAt: string | Date;
}

export interface ChatHistoryData {
  roomId: string;
  messages: ChatMessage[];
}

export type ActivityKind = "sync" | "join" | "leave";

export interface ActivityEvent {
  id: string;
  roomId: string;
  kind: ActivityKind | string;
  action?: SyncAction | string | null;
  timestamp?: number | null;
  videoUrl?: string | null;
  senderId?: string | null;
  createdAt: string | Date;
}

export interface ActivityHistoryData {
  roomId: string;
  events: ActivityEvent[];
}

const SERVER_URL =
  // For Next.js client bundles, this is replaced at build-time.
  (process.env.NEXT_PUBLIC_SOCKET_SERVER_URL as string | undefined) ??
  "http://localhost:4000";

export const useRoom = (roomId: string, userId: string) => {
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const latestRoomStateRef = useRef<RoomStateData | null>(null);
  const latestChatHistoryRef = useRef<ChatHistoryData | null>(null);
  const latestActivityHistoryRef = useRef<ActivityHistoryData | null>(null);
  const pendingSyncEventsRef = useRef<
    Array<{ action: SyncAction; timestamp: number; videoUrl?: string }>
  >([]);

  useEffect(() => {
    // Initialize socket connection
    socketRef.current = io(SERVER_URL, {
      transports: ["websocket"], // Force websocket for better performance
      autoConnect: false,
    });

    const socket = socketRef.current;

    const handleRoomState = (data: RoomStateData) => {
      latestRoomStateRef.current = data;
    };

    const handleChatHistory = (data: ChatHistoryData) => {
      latestChatHistoryRef.current = data;
    };

    const handleActivityHistory = (data: ActivityHistoryData) => {
      latestActivityHistoryRef.current = data;
    };

    // Always listen for room state so we don't miss the first push during join.
    socket.on("room_state", handleRoomState);
    socket.on("chat_history", handleChatHistory);
    socket.on("activity_history", handleActivityHistory);

    socket.on("connect", () => {
      console.log("Connected to socket server");
      setIsConnected(true);
      // Join the room immediately upon connection
      socket.emit("join_room", roomId);

      // Flush any events the user triggered before we connected.
      const pending = pendingSyncEventsRef.current;
      if (pending.length > 0) {
        pending.forEach((evt) => {
          socket.emit("sync_video", {
            roomId,
            action: evt.action,
            timestamp: evt.timestamp,
            videoUrl: evt.videoUrl,
          });
        });
        pendingSyncEventsRef.current = [];
      }
    });

    socket.on("disconnect", () => {
      console.log("Disconnected from socket server");
      setIsConnected(false);
    });

    socket.connect();

    // Cleanup on unmount
    return () => {
      socket.off("room_state", handleRoomState);
      socket.off("chat_history", handleChatHistory);
      socket.off("activity_history", handleActivityHistory);
      socket.disconnect();
    };
  }, [roomId]);

  // Function to send video sync events
  const sendSyncEvent = useCallback(
    (action: SyncAction, timestamp: number, videoUrl?: string) => {
      const socket = socketRef.current;
      if (!socket) return;

      if (!socket.connected) {
        // Queue a small backlog to avoid losing the initial change_url.
        const q = pendingSyncEventsRef.current;
        q.push({ action, timestamp, videoUrl });
        if (q.length > 10) q.shift();
        return;
      }

      socket.emit("sync_video", {
        roomId,
        action,
        timestamp,
        videoUrl,
      });
    },
    [roomId]
  );

  // Function to subscribe to sync events
  const onSyncEvent = useCallback((callback: (data: SyncData) => void) => {
    if (socketRef.current) {
      socketRef.current.on("receive_sync", callback);
    }

    // Return cleanup function for the listener
    return () => {
      if (socketRef.current) {
        socketRef.current.off("receive_sync", callback);
      }
    };
  }, []);

  // Receive full room state for late joiners.
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
    [roomId]
  );

  const requestRoomState = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;
    if (!socket.connected) return;
    socket.emit("request_room_state", roomId);
  }, [roomId]);

  const sendChatMessage = useCallback(
    (text: string) => {
      const socket = socketRef.current;
      if (!socket) return;
      if (!socket.connected) return;
      socket.emit("send_chat", { roomId, text });
    },
    [roomId]
  );

  const onChatMessage = useCallback((callback: (msg: ChatMessage) => void) => {
    if (socketRef.current) {
      socketRef.current.on("chat_message", callback);
    }
    return () => {
      if (socketRef.current) {
        socketRef.current.off("chat_message", callback);
      }
    };
  }, []);

  const onChatHistory = useCallback(
    (callback: (data: ChatHistoryData) => void) => {
      if (socketRef.current) {
        socketRef.current.on("chat_history", callback);
      }

      const cached = latestChatHistoryRef.current;
      if (cached && cached.roomId === roomId) {
        callback(cached);
      }

      return () => {
        if (socketRef.current) {
          socketRef.current.off("chat_history", callback);
        }
      };
    },
    [roomId]
  );

  const requestChatHistory = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;
    if (!socket.connected) return;
    socket.emit("request_chat_history", roomId);
  }, [roomId]);

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
    []
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
    [roomId]
  );

  const requestActivityHistory = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;
    if (!socket.connected) return;
    socket.emit("request_activity_history", roomId);
  }, [roomId]);

  return {
    isConnected,
    sendSyncEvent,
    onSyncEvent,
    onRoomState,
    requestRoomState,
    sendChatMessage,
    onChatMessage,
    onChatHistory,
    requestChatHistory,
    onActivityEvent,
    onActivityHistory,
    requestActivityHistory,
    socket: socketRef.current,
  };
};
