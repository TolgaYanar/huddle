import { useCallback, useEffect, useState, useRef } from "react";
import { io, Socket } from "socket.io-client";

// Define types for our sync events
export type SyncAction =
  | "play"
  | "pause"
  | "seek"
  | "change_url"
  | "set_mute"
  | "set_speed"
  | "set_volume"
  | "set_audio_sync";

export interface SyncData {
  roomId: string;
  action: SyncAction;
  timestamp: number;
  videoUrl?: string;
  updatedAt?: number;
  volume?: number;
  isMuted?: boolean;
  playbackSpeed?: number;
  audioSyncEnabled?: boolean;
  senderId?: string;
  senderUsername?: string | null;
}

export interface RoomStateData {
  roomId: string;
  videoUrl?: string;
  timestamp?: number;
  action?: SyncAction;
  isPlaying?: boolean;
  volume?: number;
  isMuted?: boolean;
  playbackSpeed?: number;
  audioSyncEnabled?: boolean;
  updatedAt?: number;
  senderId?: string;
  senderUsername?: string | null;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderUsername?: string | null;
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
  senderUsername?: string | null;
  createdAt: string | Date;
}

export interface ActivityHistoryData {
  roomId: string;
  events: ActivityEvent[];
}

export interface RoomUsersData {
  roomId: string;
  users: string[];
  // Optional map of socketId -> username (if available)
  usernames?: Record<string, string | null>;
  mediaStates?: Record<string, WebRTCMediaState>;
  hostId?: string | null;
}

export interface RoomPasswordStatusData {
  roomId: string;
  hasPassword: boolean;
}

export interface RoomPasswordRequiredData {
  roomId: string;
  reason?: "required" | "invalid";
}

export type UserPresenceData =
  | string
  | {
      socketId: string;
      username?: string | null;
    };

export interface WheelSpinData {
  index: number;
  result: string;
  entryCount: number;
  spunAt: number;
  senderId?: string;
}

export interface WheelStateData {
  roomId: string;
  entries: string[];
  lastSpin?: WheelSpinData | null;
}

export interface WheelSpunData {
  roomId: string;
  index: number;
  result: string;
  entryCount: number;
  spunAt: number;
  senderId?: string;
  entries?: string[];
}

export interface WebRTCMediaState {
  mic: boolean;
  cam: boolean;
  screen: boolean;
}

function getServerUrl(): string {
  // For Next.js client bundles, env vars are replaced at build-time.
  const fromEnv = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL as
    | string
    | undefined;
  if (typeof fromEnv === "string") {
    const trimmed = fromEnv.trim();

    // Allow setting an explicit empty value to mean "same origin".
    if (!trimmed) {
      if (typeof window !== "undefined") return window.location.origin;
      return "";
    }

    if (typeof window !== "undefined") {
      const currentOrigin = window.location.origin;
      const hostname = window.location.hostname || "localhost";
      const isLocalHost =
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "0.0.0.0";

      // In production, we strongly prefer same-origin Socket.IO so the
      // HttpOnly session cookie (set on the web origin) is included.
      // If you *really* need a direct cross-origin socket URL, use localhost
      // for dev or ensure auth is passed via Bearer token instead of cookies.
      if (!isLocalHost) return currentOrigin;
    }

    return trimmed;
  }

  // If the web app is opened from a phone/tablet, "localhost" points to that
  // device, not the dev machine. Default to the current hostname instead.
  if (typeof window !== "undefined") {
    const { protocol, hostname, origin } = window.location;
    const safeProtocol = protocol || "http:";
    const safeHostname = hostname || "localhost";

    // Local dev convention: web on :3000, server on :4000.
    const isLocalHost =
      safeHostname === "localhost" ||
      safeHostname === "127.0.0.1" ||
      safeHostname === "0.0.0.0";

    if (isLocalHost) return `${safeProtocol}//${safeHostname}:4000`;

    // Production convention: connect to the same origin so the HttpOnly
    // session cookie is automatically included in the Socket.IO handshake.
    return origin;
  }

  return "http://localhost:4000";
}

const SERVER_URL = getServerUrl();

export const useRoom = (roomId: string, userId: string) => {
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const latestRoomStateRef = useRef<RoomStateData | null>(null);
  const latestChatHistoryRef = useRef<ChatHistoryData | null>(null);
  const latestActivityHistoryRef = useRef<ActivityHistoryData | null>(null);
  const latestRoomUsersRef = useRef<RoomUsersData | null>(null);
  const latestRoomPasswordStatusRef = useRef<RoomPasswordStatusData | null>(
    null
  );
  const latestRoomPasswordRequiredRef = useRef<RoomPasswordRequiredData | null>(
    null
  );
  const latestWheelStateRef = useRef<WheelStateData | null>(null);
  const latestWheelSpunRef = useRef<WheelSpunData | null>(null);
  const pendingSyncEventsRef = useRef<
    Array<{
      action: SyncAction;
      timestamp: number;
      videoUrl?: string;
      volume?: number;
      isMuted?: boolean;
      playbackSpeed?: number;
      audioSyncEnabled?: boolean;
    }>
  >([]);

  useEffect(() => {
    // Initialize socket connection
    socketRef.current = io(SERVER_URL, {
      // Prefer starting with polling so we can connect even when WebSocket
      // upgrades are blocked by proxies/CDNs. Socket.IO will still try to
      // upgrade to WebSocket when possible.
      transports: ["polling", "websocket"],
      autoConnect: false,
      withCredentials: true,
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

    // Always listen for room state so we don't miss the first push during join.
    socket.on("room_state", handleRoomState);
    socket.on("chat_history", handleChatHistory);
    socket.on("activity_history", handleActivityHistory);
    socket.on("room_users", handleRoomUsers);
    socket.on("room_password_status", handleRoomPasswordStatus);
    socket.on("room_requires_password", handleRoomPasswordRequired);
    socket.on("wheel_state", handleWheelState);
    socket.on("wheel_spun", handleWheelSpun);

    socket.on("connect_error", (err) => {
      // This is the most useful signal when connections fail in production.
      console.warn("Socket connect_error:", err?.message || err);
    });

    socket.on("disconnect", () => {
      console.log("Disconnected from socket server");
      setIsConnected(false);
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

    socket.on("disconnect", () => {
      console.log("Disconnected from socket server");
      setIsConnected(false);
      // Avoid stale cached room/users/password data showing up while disconnected or on the next reconnect.
      clearCachedRoomData();
    });

    socket.connect();

    // Cleanup on unmount
    return () => {
      socket.off("room_state", handleRoomState);
      socket.off("chat_history", handleChatHistory);
      socket.off("activity_history", handleActivityHistory);
      socket.off("room_users", handleRoomUsers);
      socket.off("room_password_status", handleRoomPasswordStatus);
      socket.off("room_requires_password", handleRoomPasswordRequired);
      socket.off("wheel_state", handleWheelState);
      socket.off("wheel_spun", handleWheelSpun);
      socket.disconnect();
    };
  }, [roomId]);

  const joinRoom = useCallback(
    (password?: string) => {
      const socket = socketRef.current;
      if (!socket) return;
      if (!socket.connected) return;
      socket.emit("join_room", { roomId, password: password || undefined });
    },
    [roomId]
  );

  const setRoomPassword = useCallback(
    (password: string) => {
      const socket = socketRef.current;
      if (!socket) return;
      if (!socket.connected) return;
      socket.emit("set_room_password", { roomId, password });
    },
    [roomId]
  );

  // Function to send video sync events
  const sendSyncEvent = useCallback(
    (
      action: SyncAction,
      timestamp: number,
      videoUrl?: string,
      extra?: Pick<
        SyncData,
        "volume" | "isMuted" | "playbackSpeed" | "audioSyncEnabled"
      >
    ) => {
      const socket = socketRef.current;
      if (!socket) return;

      if (!socket.connected) {
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
    [roomId]
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
    [roomId]
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
    [roomId]
  );

  const requestWheelState = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;
    if (!socket.connected) return;
    socket.emit("wheel_get", { roomId });
  }, [roomId]);

  const addWheelEntry = useCallback(
    (text: string) => {
      const socket = socketRef.current;
      if (!socket) return;
      if (!socket.connected) return;
      socket.emit("wheel_add_entry", { roomId, text });
    },
    [roomId]
  );

  const removeWheelEntry = useCallback(
    (index: number) => {
      const socket = socketRef.current;
      if (!socket) return;
      if (!socket.connected) return;
      socket.emit("wheel_remove_entry", { roomId, index });
    },
    [roomId]
  );

  const clearWheelEntries = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;
    if (!socket.connected) return;
    socket.emit("wheel_clear", { roomId });
  }, [roomId]);

  const spinWheel = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;
    if (!socket.connected) return;
    socket.emit("wheel_spin", { roomId });
  }, [roomId]);

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
    [roomId]
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
    [roomId]
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
    []
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
    []
  );

  const sendWebRTCOffer = useCallback(
    (to: string, sdp: unknown) => {
      const socket = socketRef.current;
      if (!socket) return;
      if (!socket.connected) return;
      socket.emit("webrtc_offer", { roomId, to, sdp });
    },
    [roomId]
  );

  const sendWebRTCAnswer = useCallback(
    (to: string, sdp: unknown) => {
      const socket = socketRef.current;
      if (!socket) return;
      if (!socket.connected) return;
      socket.emit("webrtc_answer", { roomId, to, sdp });
    },
    [roomId]
  );

  const sendWebRTCIce = useCallback(
    (to: string, candidate: unknown) => {
      const socket = socketRef.current;
      if (!socket) return;
      if (!socket.connected) return;
      socket.emit("webrtc_ice", { roomId, to, candidate });
    },
    [roomId]
  );

  const onWebRTCOffer = useCallback(
    (
      callback: (data: { roomId: string; from: string; sdp: unknown }) => void
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
    []
  );

  const onWebRTCAnswer = useCallback(
    (
      callback: (data: { roomId: string; from: string; sdp: unknown }) => void
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
    []
  );

  const onWebRTCIce = useCallback(
    (
      callback: (data: {
        roomId: string;
        from: string;
        candidate: unknown;
      }) => void
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
    []
  );

  const sendWebRTCMediaState = useCallback(
    (state: WebRTCMediaState) => {
      const socket = socketRef.current;
      if (!socket) return;
      if (!socket.connected) return;
      socket.emit("webrtc_media_state", { roomId, state });
    },
    [roomId]
  );

  const onWebRTCMediaState = useCallback(
    (
      callback: (data: {
        roomId: string;
        from: string;
        state: WebRTCMediaState;
      }) => void
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
    []
  );

  const sendWebRTCSpeaking = useCallback(
    (speaking: boolean) => {
      const socket = socketRef.current;
      if (!socket) return;
      if (!socket.connected) return;
      socket.emit("webrtc_speaking", { roomId, speaking });
    },
    [roomId]
  );

  const onWebRTCSpeaking = useCallback(
    (
      callback: (data: {
        roomId: string;
        from: string;
        speaking: boolean;
      }) => void
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
    []
  );

  return {
    isConnected,
    joinRoom,
    setRoomPassword,
    requestWheelState,
    addWheelEntry,
    removeWheelEntry,
    clearWheelEntries,
    spinWheel,
    onWheelState,
    onWheelSpun,
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
    onRoomUsers,
    onRoomPasswordStatus,
    onRoomPasswordRequired,
    onUserJoined,
    onUserLeft,
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
    socket: socketRef.current,
  };
};
