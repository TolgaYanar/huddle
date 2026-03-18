import { useCallback, useEffect, useRef, useState } from "react";
import type { GameRoundInput, GameStateData } from "shared-logic";

export function useGame({
  onGameState,
  requestGameState,
  startGame,
  submitGuess,
  revealHint,
  skipTurn,
  endRound,
  nextRound,
  endGame,
  resetGame,
  mySocketId,
}: {
  onGameState: (cb: (data: GameStateData) => void) => () => void;
  requestGameState: () => void;
  startGame: (rounds: GameRoundInput[]) => void;
  submitGuess: (guess: string) => void;
  revealHint: () => void;
  skipTurn: () => void;
  endRound: () => void;
  nextRound: () => void;
  endGame: () => void;
  resetGame: () => void;
  mySocketId: string;
}) {
  const [gameState, setGameState] = useState<GameStateData>({
    roomId: "",
    status: "idle",
  });
  const [guessInput, setGuessInput] = useState("");
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    const cleanup = onGameState((data) => {
      if (mountedRef.current) setGameState(data);
    });
    requestGameState();
    return cleanup;
  }, [onGameState, requestGameState]);

  // Reset guess input on turn change or round change
  useEffect(() => {
    setGuessInput("");
  }, [gameState.currentTurnIndex, gameState.currentRoundIndex, gameState.status]);

  const isMyTurn =
    gameState.status === "active" &&
    gameState.currentRound?.status === "active" &&
    gameState.currentTurnSocketId === mySocketId;

  const amQuestioner =
    mySocketId !== "" && gameState.questionerId === mySocketId;

  const handleSubmitGuess = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!guessInput.trim()) return;
      submitGuess(guessInput.trim());
      setGuessInput("");
    },
    [guessInput, submitGuess],
  );

  const handleStartGame = useCallback(
    (rounds: GameRoundInput[]) => {
      startGame(rounds);
      setIsSetupOpen(false);
    },
    [startGame],
  );

  return {
    gameState,
    guessInput,
    setGuessInput,
    isMyTurn,
    amQuestioner,
    isSetupOpen,
    setIsSetupOpen,
    handleSubmitGuess,
    handleStartGame,
    revealHint,
    skipTurn,
    endRound,
    nextRound,
    endGame,
    resetGame,
  };
}
