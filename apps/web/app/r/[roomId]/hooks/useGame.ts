import { useCallback, useEffect, useRef, useState } from "react";
import type { GameStateData } from "shared-logic";

export function useGame({
  onGameState,
  requestGameState,
  startGame,
  submitGuess,
  revealHint,
  skipTurn,
  endGame,
  resetGame,
  mySocketId,
}: {
  onGameState: (cb: (data: GameStateData) => void) => () => void;
  requestGameState: () => void;
  startGame: (category: string, answer: string, images: string[], hideBlanks: boolean) => void;
  submitGuess: (guess: string) => void;
  revealHint: () => void;
  skipTurn: () => void;
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

  // Reset guess input when turn changes or game ends
  useEffect(() => {
    setGuessInput("");
  }, [gameState.currentTurnIndex, gameState.status]);

  const isMyTurn =
    gameState.status === "active" &&
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
    (category: string, answer: string, images: string[], hideBlanks: boolean) => {
      startGame(category, answer, images, hideBlanks);
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
    endGame,
    resetGame,
  };
}
