import { useEffect, useRef, useState } from "react";
import type {
  CreateCupGameOptions,
  CupGameResolvePayload,
  CupGameStateData,
} from "shared-logic";

type Socket = { on: (e: string, h: (...args: unknown[]) => void) => unknown; off: (e: string, h: (...args: unknown[]) => void) => unknown } | null;

export function useCupGame({
  socket,
  onCupGameState,
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
  mySocketId,
}: {
  socket?: Socket;
  onCupGameState: (cb: (data: CupGameStateData) => void) => () => void;
  requestCupGameState: () => void;
  createCupGame: (options?: CreateCupGameOptions) => void;
  updateCupGameConfig: (gameId: string, options: CreateCupGameOptions) => void;
  startCupGamePlacement: (gameId: string) => void;
  toggleCupGameSpider: (gameId: string, cupIndex: number) => void;
  lockCupGamePlacement: (gameId: string) => void;
  unlockCupGamePlacement: (gameId: string) => void;
  flipCup: (gameId: string, cupIndex: number) => void;
  drawCupGameCard: (gameId: string) => void;
  resolveCupGameCard: (gameId: string, payload: CupGameResolvePayload) => void;
  cancelCupGameCard: (gameId: string) => void;
  resetCupGame: (gameId: string) => void;
  mySocketId: string;
}) {
  const [cupGameState, setCupGameState] = useState<CupGameStateData>({
    roomId: "",
    games: [],
  });
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const cleanup = onCupGameState((data) => {
      if (mountedRef.current) setCupGameState(data);
    });
    requestCupGameState();
    return cleanup;
  }, [onCupGameState, requestCupGameState]);

  // Bridge the per-socket peek result event into a DOM CustomEvent the panel
  // listens for. Keeping it out of the panel itself means the panel doesn't
  // need a direct socket reference.
  useEffect(() => {
    if (!socket) return;
    const handler = (...args: unknown[]) => {
      const payload = args[0] as
        | { cupIndex: number; revealedAs: "empty" | "spider"; ownerSocketId: string | null }
        | undefined;
      if (!payload || typeof window === "undefined") return;
      window.dispatchEvent(
        new CustomEvent("cup-game-peek-result", { detail: payload }),
      );
    };
    socket.on("cup_game_peek_result", handler);
    return () => {
      socket.off("cup_game_peek_result", handler);
    };
  }, [socket]);

  return {
    cupGameState,
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
    mySocketId,
  };
}
