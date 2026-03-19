import { useCallback } from "react";
import type { MutableRefObject } from "react";
import type { Socket } from "socket.io-client";

import type { GameRoundInput, GameStateData } from "../types";

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

  // Create a new game (caller becomes creator + first questioner)
  const createGame = useCallback(
    (rounds: GameRoundInput[]) => {
      const socket = socketRef.current;
      if (!socket?.connected) return;
      socket.emit("game_create", { roomId, rounds });
    },
    [roomId, socketRef],
  );

  // Add / replace your rounds in an existing game (join as questioner)
  const addRounds = useCallback(
    (gameId: string, rounds: GameRoundInput[]) => {
      const socket = socketRef.current;
      if (!socket?.connected) return;
      socket.emit("game_add_rounds", { roomId, gameId, rounds });
    },
    [roomId, socketRef],
  );

  // Remove your rounds from a game (non-creator only)
  const removeRounds = useCallback(
    (gameId: string) => {
      const socket = socketRef.current;
      if (!socket?.connected) return;
      socket.emit("game_remove_rounds", { roomId, gameId });
    },
    [roomId, socketRef],
  );

  // Start the session — creator only
  const startSession = useCallback(
    (gameId: string) => {
      const socket = socketRef.current;
      if (!socket?.connected) return;
      socket.emit("session_start", { roomId, gameId });
    },
    [roomId, socketRef],
  );

  const submitGuess = useCallback(
    (gameId: string, guess: string) => {
      const socket = socketRef.current;
      if (!socket?.connected) return;
      socket.emit("game_guess", { roomId, gameId, guess });
    },
    [roomId, socketRef],
  );

  const revealHint = useCallback(
    (gameId: string) => {
      const socket = socketRef.current;
      if (!socket?.connected) return;
      socket.emit("game_hint", { roomId, gameId });
    },
    [roomId, socketRef],
  );

  const skipTurn = useCallback(
    (gameId: string) => {
      const socket = socketRef.current;
      if (!socket?.connected) return;
      socket.emit("game_skip_turn", { roomId, gameId });
    },
    [roomId, socketRef],
  );

  const endRound = useCallback(
    (gameId: string) => {
      const socket = socketRef.current;
      if (!socket?.connected) return;
      socket.emit("game_end_round", { roomId, gameId });
    },
    [roomId, socketRef],
  );

  const nextRound = useCallback(
    (gameId: string) => {
      const socket = socketRef.current;
      if (!socket?.connected) return;
      socket.emit("game_next_round", { roomId, gameId });
    },
    [roomId, socketRef],
  );

  // End session — creator only
  const endSession = useCallback(
    (gameId: string) => {
      const socket = socketRef.current;
      if (!socket?.connected) return;
      socket.emit("session_end", { roomId, gameId });
    },
    [roomId, socketRef],
  );

  // Delete/reset a game
  const resetGame = useCallback(
    (gameId: string) => {
      const socket = socketRef.current;
      if (!socket?.connected) return;
      socket.emit("game_reset", { roomId, gameId });
    },
    [roomId, socketRef],
  );

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
    createGame,
    addRounds,
    removeRounds,
    startSession,
    submitGuess,
    revealHint,
    skipTurn,
    endRound,
    nextRound,
    endSession,
    resetGame,
    onGameState,
  };
}
