import { useCallback } from "react";
import type { MutableRefObject } from "react";
import type { Socket } from "socket.io-client";

import type { ChatHistoryData, ChatMessage } from "../types";

export function useChatApi({
  roomId,
  socketRef,
  latestChatHistoryRef,
}: {
  roomId: string;
  socketRef: MutableRefObject<Socket | null>;
  latestChatHistoryRef: MutableRefObject<ChatHistoryData | null>;
}) {
  const sendChatMessage = useCallback(
    (text: string) => {
      const socket = socketRef.current;
      if (!socket) return;
      if (!socket.connected) return;
      socket.emit("send_chat", { roomId, text });
    },
    [roomId, socketRef],
  );

  const onChatMessage = useCallback(
    (callback: (msg: ChatMessage) => void) => {
      if (socketRef.current) {
        socketRef.current.on("chat_message", callback);
      }
      return () => {
        if (socketRef.current) {
          socketRef.current.off("chat_message", callback);
        }
      };
    },
    [socketRef],
  );

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
    [latestChatHistoryRef, roomId, socketRef],
  );

  const requestChatHistory = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;
    if (!socket.connected) return;
    socket.emit("request_chat_history", roomId);
  }, [roomId, socketRef]);

  const addReaction = useCallback(
    (messageId: string, emoji: string) => {
      const socket = socketRef.current;
      if (!socket?.connected) return;
      socket.emit("add_reaction", { roomId, messageId, emoji });
    },
    [roomId, socketRef],
  );

  const onReactionUpdated = useCallback(
    (
      callback: (data: {
        messageId: string;
        reactions: Record<string, string[]>;
      }) => void,
    ) => {
      if (socketRef.current) {
        socketRef.current.on("reaction_updated", callback);
      }
      return () => {
        if (socketRef.current) {
          socketRef.current.off("reaction_updated", callback);
        }
      };
    },
    [socketRef],
  );

  return {
    sendChatMessage,
    onChatMessage,
    onChatHistory,
    requestChatHistory,
    addReaction,
    onReactionUpdated,
  };
}
