import { useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import type { UserPresenceData } from "shared-logic";

interface UseRoomStateProps {
  roomId: string;
  userId: string;
  socket: Socket | null;
  onRoomUsers?: (
    callback: (data: {
      roomId: string;
      users: string[];
      usernames?: Record<string, string | null>;
      hostId?: string | null;
    }) => void
  ) => (() => void) | undefined;
  onUserJoined?: (
    callback: (peer: UserPresenceData) => void
  ) => (() => void) | undefined;
  onUserLeft?: (
    callback: (peer: UserPresenceData) => void
  ) => (() => void) | undefined;
  onRoomPasswordStatus?: (
    callback: (data: { roomId: string; hasPassword: boolean }) => void
  ) => (() => void) | undefined;
  onRoomPasswordRequired?: (
    callback: (data: { roomId: string; reason?: string }) => void
  ) => (() => void) | undefined;
  joinRoom: (password?: string) => void;
}

export function useRoomState({
  roomId,
  userId,
  socket,
  onRoomUsers,
  onUserJoined,
  onUserLeft,
  onRoomPasswordStatus,
  onRoomPasswordRequired,
  joinRoom,
}: UseRoomStateProps) {
  const [hostId, setHostId] = useState<string | null>(null);
  const [roomName, setRoomNameState] = useState<string | null>(null);
  const [participants, setParticipants] = useState<string[]>([]);
  const [usernamesById, setUsernamesById] = useState<
    Record<string, string | null>
  >({});
  const [roomAccessError, setRoomAccessError] = useState<string | null>(null);
  const [hasRoomPassword, setHasRoomPassword] = useState(false);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const lastSubmittedPasswordRef = useRef<string | null>(null);

  // Track the room host
  useEffect(() => {
    if (!onRoomUsers) return;
    const cleanup = onRoomUsers((data) => {
      if (data.roomId !== roomId) return;
      const nextHost = data.hostId;
      if (typeof nextHost !== "undefined") {
        setHostId(nextHost ?? null);
      }

      if (data.usernames && typeof data.usernames === "object") {
        setUsernamesById((prev) => ({
          ...prev,
          ...data.usernames,
        }));
      }

      if (Array.isArray(data.users)) {
        setParticipants(
          Array.from(new Set(data.users.filter((id) => id && id !== userId)))
        );
      }

      setPasswordRequired(false);
      setPasswordError(null);

      const submitted = lastSubmittedPasswordRef.current;
      if (submitted) {
        try {
          window.sessionStorage.setItem(
            `huddle:roomPassword:${roomId}`,
            submitted
          );
        } catch {
          // ignore
        }
        lastSubmittedPasswordRef.current = null;
      }
    });
    return () => {
      cleanup?.();
    };
  }, [onRoomUsers, roomId, userId]);

  // Password status + required events
  useEffect(() => {
    const cleanupStatus = onRoomPasswordStatus?.((data) => {
      if (data.roomId !== roomId) return;
      setHasRoomPassword(!!data.hasPassword);
      setPasswordRequired(false);
      setPasswordError(null);
    });

    const cleanupRequired = onRoomPasswordRequired?.((data) => {
      if (data.roomId !== roomId) return;
      setPasswordRequired(true);
      setPasswordError(
        data.reason === "invalid"
          ? "Wrong password. Try again."
          : "This room requires a password."
      );

      if (data.reason === "invalid") {
        try {
          window.sessionStorage.removeItem(`huddle:roomPassword:${roomId}`);
        } catch {
          // ignore
        }
      }
    });

    return () => {
      cleanupStatus?.();
      cleanupRequired?.();
    };
  }, [onRoomPasswordStatus, onRoomPasswordRequired, roomId]);

  // Keep participant list updated
  useEffect(() => {
    const toSocketId = (peer: UserPresenceData) =>
      typeof peer === "string" ? peer : peer?.socketId;

    const cleanupJoined = onUserJoined?.((peer) => {
      const peerId = toSocketId(peer);
      if (!peerId || peerId === userId) return;

      if (typeof peer === "object" && peer) {
        const uname =
          typeof peer.username === "string" && peer.username.trim()
            ? peer.username
            : null;
        if (uname) {
          setUsernamesById((prev) => ({ ...prev, [peerId]: uname }));
        }
      }

      setParticipants((prev) => Array.from(new Set([...prev, peerId])));
    });
    const cleanupLeft = onUserLeft?.((peer) => {
      const peerId = toSocketId(peer);
      if (!peerId) return;
      setParticipants((prev) => prev.filter((id) => id !== peerId));
      setUsernamesById((prev) => {
        if (!prev[peerId]) return prev;
        const next = { ...prev };
        delete next[peerId];
        return next;
      });
    });
    return () => {
      cleanupJoined?.();
      cleanupLeft?.();
    };
  }, [onUserJoined, onUserLeft, userId]);

  // Socket events for host, banned, and room name
  useEffect(() => {
    if (!socket) return;
    const onHost = (data: { roomId: string; hostId?: string | null }) => {
      if (data.roomId !== roomId) return;
      setHostId(data.hostId ?? null);
    };

    const onBanned = (data: { roomId: string }) => {
      if (data.roomId !== roomId) return;
      setRoomAccessError("You no longer have access to this room.");
      try {
        socket.disconnect();
      } catch {
        // ignore
      }
    };

    const onRoomNameChanged = (data: { roomId: string; name: string | null }) => {
      if (data.roomId !== roomId) return;
      setRoomNameState(data.name ?? null);
    };

    const onUsernameChanged = (data: { socketId: string; username: string | null }) => {
      setUsernamesById((prev) => ({ ...prev, [data.socketId]: data.username }));
    };

    socket.on("room_host", onHost);
    socket.on("room_banned", onBanned);
    socket.on("room_name_changed", onRoomNameChanged);
    socket.on("username_changed", onUsernameChanged);

    return () => {
      socket.off("room_host", onHost);
      socket.off("room_banned", onBanned);
      socket.off("room_name_changed", onRoomNameChanged);
      socket.off("username_changed", onUsernameChanged);
    };
  }, [socket, roomId]);

  const submitRoomPassword = () => {
    const pw = passwordInput.trim();
    lastSubmittedPasswordRef.current = pw;
    joinRoom(pw);
  };

  const kickUser = (targetId: string) => {
    if (!socket?.connected) return;
    socket.emit("kick_user", { roomId, targetId });
  };

  const setRoomName = (name: string) => {
    if (!socket?.connected) return;
    socket.emit("set_room_name", { roomId, name });
  };

  const transferHost = (targetId: string) => {
    if (!socket?.connected) return;
    socket.emit("transfer_host", { roomId, targetId });
  };

  return {
    hostId,
    roomName,
    setRoomName,
    transferHost,
    participants,
    usernamesById,
    roomAccessError,
    hasRoomPassword,
    setHasRoomPassword,
    passwordRequired,
    passwordInput,
    setPasswordInput,
    passwordError,
    submitRoomPassword,
    kickUser,
  };
}
