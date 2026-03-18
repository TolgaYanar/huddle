import { useCallback } from "react";
import type { MutableRefObject } from "react";
import type { Socket } from "socket.io-client";

import type { GameStateData } from "../types";

export function useGameApi({
  roomId,
  socketRef,
  latestGameStateRef,
}: {
  roomId: string;
  socketRef: MutableRefObject<Socket | null>;
  latestGameStateRef: MutableRefObject<GameStateData | null>;
}) {
  const requestGameState = useCallback(() => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    socket.emit("game_get", { roomId });
  }, [roomId, socketRef]);

  const startGame = useCallback(
    (category: string, answer: string, images: string[], hideBlanks: boolean) => {
      const socket = socketRef.current;
      if (!socket?.connected) return;
      socket.emit("game_start", { roomId, category, answer, images, hideBlanks });
    },
    [roomId, socketRef],
  );

  const submitGuess = useCallback(
    (guess: string) => {
      const socket = socketRef.current;
      if (!socket?.connected) return;
      socket.emit("game_guess", { roomId, guess });
    },
    [roomId, socketRef],
  );

  const revealHint = useCallback(() => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    socket.emit("game_hint", { roomId });
  }, [roomId, socketRef]);

  const skipTurn = useCallback(() => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    socket.emit("game_skip_turn", { roomId });
  }, [roomId, socketRef]);

  const endGame = useCallback(() => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    socket.emit("game_end", { roomId });
  }, [roomId, socketRef]);

  const resetGame = useCallback(() => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    socket.emit("game_reset", { roomId });
  }, [roomId, socketRef]);

  const onGameState = useCallback(
    (callback: (data: GameStateData) => void) => {
      if (socketRef.current) {
        socketRef.current.on("game_state", callback);
      }

      const cached = latestGameStateRef.current;
      if (cached && cached.roomId === roomId) {
        callback(cached);
      }

      return () => {
        if (socketRef.current) {
          socketRef.current.off("game_state", callback);
        }
      };
    },
    [latestGameStateRef, roomId, socketRef],
  );

  return {
    requestGameState,
    startGame,
    submitGuess,
    revealHint,
    skipTurn,
    endGame,
    resetGame,
    onGameState,
  };
}
