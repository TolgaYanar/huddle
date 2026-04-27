import { useCallback } from "react";
import type { MutableRefObject } from "react";
import type { Socket } from "socket.io-client";

import type {
  CreateCupGameOptions,
  CupGameResolvePayload,
  CupGameStateData,
} from "../types";

/**
 * Socket emitters + `cup_game_state` listener for the Cup Spider game. Mirrors
 * the shape of `useGameApi` for Guess It so the room view-model can wire it
 * the same way.
 */
export function useCupGameApi({
  roomId,
  socketRef,
  latestCupGameStateRef,
}: {
  roomId: string;
  socketRef: MutableRefObject<Socket | null>;
  latestCupGameStateRef: MutableRefObject<CupGameStateData | null>;
}) {
  const requestCupGameState = useCallback(() => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    socket.emit("cup_game_get", { roomId });
  }, [roomId, socketRef]);

  const createCupGame = useCallback(
    (options?: CreateCupGameOptions) => {
      const socket = socketRef.current;
      if (!socket?.connected) return;
      socket.emit("cup_game_create", {
        roomId,
        startingLives: options?.startingLives ?? null,
        gridSize: options?.gridSize ?? null,
        turnTimerSeconds: options?.turnTimerSeconds ?? null,
      });
    },
    [roomId, socketRef],
  );

  const updateCupGameConfig = useCallback(
    (gameId: string, options: CreateCupGameOptions) => {
      const socket = socketRef.current;
      if (!socket?.connected) return;
      socket.emit("cup_game_update_config", {
        roomId,
        gameId,
        startingLives: options.startingLives ?? null,
        gridSize: options.gridSize ?? null,
        turnTimerSeconds: options.turnTimerSeconds ?? null,
      });
    },
    [roomId, socketRef],
  );

  const startCupGamePlacement = useCallback(
    (gameId: string) => {
      const socket = socketRef.current;
      if (!socket?.connected) return;
      socket.emit("cup_game_start_placement", { roomId, gameId });
    },
    [roomId, socketRef],
  );

  const toggleCupGameSpider = useCallback(
    (gameId: string, cupIndex: number) => {
      const socket = socketRef.current;
      if (!socket?.connected) return;
      socket.emit("cup_game_toggle_spider", { roomId, gameId, cupIndex });
    },
    [roomId, socketRef],
  );

  const lockCupGamePlacement = useCallback(
    (gameId: string) => {
      const socket = socketRef.current;
      if (!socket?.connected) return;
      socket.emit("cup_game_lock_placement", { roomId, gameId });
    },
    [roomId, socketRef],
  );

  const unlockCupGamePlacement = useCallback(
    (gameId: string) => {
      const socket = socketRef.current;
      if (!socket?.connected) return;
      socket.emit("cup_game_unlock_placement", { roomId, gameId });
    },
    [roomId, socketRef],
  );

  const flipCup = useCallback(
    (gameId: string, cupIndex: number) => {
      const socket = socketRef.current;
      if (!socket?.connected) return;
      socket.emit("cup_game_flip", { roomId, gameId, cupIndex });
    },
    [roomId, socketRef],
  );

  const drawCupGameCard = useCallback(
    (gameId: string) => {
      const socket = socketRef.current;
      if (!socket?.connected) return;
      socket.emit("cup_game_draw", { roomId, gameId });
    },
    [roomId, socketRef],
  );

  const resolveCupGameCard = useCallback(
    (gameId: string, payload: CupGameResolvePayload) => {
      const socket = socketRef.current;
      if (!socket?.connected) return;
      socket.emit("cup_game_resolve_card", { roomId, gameId, ...payload });
    },
    [roomId, socketRef],
  );

  const cancelCupGameCard = useCallback(
    (gameId: string) => {
      const socket = socketRef.current;
      if (!socket?.connected) return;
      socket.emit("cup_game_cancel_card", { roomId, gameId });
    },
    [roomId, socketRef],
  );

  const resetCupGame = useCallback(
    (gameId: string) => {
      const socket = socketRef.current;
      if (!socket?.connected) return;
      socket.emit("cup_game_reset", { roomId, gameId });
    },
    [roomId, socketRef],
  );

  const onCupGameState = useCallback(
    (callback: (data: CupGameStateData) => void) => {
      if (socketRef.current) {
        socketRef.current.on("cup_game_state", callback);
      }

      const cached = latestCupGameStateRef.current;
      if (cached && cached.roomId === roomId) {
        callback(cached);
      }

      return () => {
        if (socketRef.current) {
          socketRef.current.off("cup_game_state", callback);
        }
      };
    },
    [latestCupGameStateRef, roomId, socketRef],
  );

  return {
    requestCupGameState,
    createCupGame,
    updateCupGameConfig,
    startCupGamePlacement,
    toggleCupGameSpider,
    lockCupGamePlacement,
    unlockCupGamePlacement,
    flipCup,
    drawCupGameCard,
    resolveCupGameCard,
    cancelCupGameCard,
    resetCupGame,
    onCupGameState,
  };
}
