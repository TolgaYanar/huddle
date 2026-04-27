import { useEffect, useRef, useState } from "react";
import type {
  CreateGameOptions,
  GameRoundInput,
  GameStateData,
} from "shared-logic";

export function useGame({
  onGameState,
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
  setObserver,
  resetGame,
  mySocketId,
}: {
  onGameState: (cb: (data: GameStateData) => void) => () => void;
  requestGameState: () => void;
  createGame: (rounds: GameRoundInput[], options?: CreateGameOptions) => void;
  addRounds: (gameId: string, rounds: GameRoundInput[]) => void;
  removeRounds: (gameId: string) => void;
  startSession: (gameId: string) => void;
  submitGuess: (gameId: string, guess: string) => void;
  revealHint: (gameId: string) => void;
  skipTurn: (gameId: string) => void;
  endRound: (gameId: string) => void;
  nextRound: (gameId: string) => void;
  endSession: (gameId: string) => void;
  setObserver: (gameId: string, observer: boolean) => void;
  resetGame: (gameId: string) => void;
  mySocketId: string;
}) {
  const [gameState, setGameState] = useState<GameStateData>({
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
    const cleanup = onGameState((data) => {
      if (mountedRef.current) setGameState(data);
    });
    requestGameState();
    return cleanup;
  }, [onGameState, requestGameState]);

  return {
    gameState,
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
    setObserver,
    resetGame,
    mySocketId,
  };
}
