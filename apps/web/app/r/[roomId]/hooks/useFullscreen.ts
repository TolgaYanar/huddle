import { useCallback, useEffect, useRef, useState } from "react";

interface UseFullscreenProps {
  isClient: boolean;
}

export function useFullscreen({ isClient }: UseFullscreenProps) {
  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const screenStageContainerRef = useRef<HTMLDivElement | null>(null);

  const [isPlayerFullscreen, setIsPlayerFullscreen] = useState(false);
  const [isScreenFullscreen, setIsScreenFullscreen] = useState(false);
  const [fullscreenChatOpen, setFullscreenChatOpen] = useState(false);

  useEffect(() => {
    if (!isClient) return;
    const onFsChange = () => {
      const fsEl = document.fullscreenElement;
      setIsScreenFullscreen(
        Boolean(fsEl && fsEl === screenStageContainerRef.current)
      );
      setIsPlayerFullscreen(
        Boolean(fsEl && fsEl === playerContainerRef.current)
      );
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
    };
  }, [isClient]);

  useEffect(() => {
    if (!isPlayerFullscreen) {
      setFullscreenChatOpen(false);
    }
  }, [isPlayerFullscreen]);

  const toggleScreenFullscreen = useCallback(async () => {
    if (!isClient) return;
    const el = screenStageContainerRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await el.requestFullscreen();
      }
    } catch {
      // ignore
    }
  }, [isClient]);

  const togglePlayerFullscreen = useCallback(async () => {
    if (!isClient) return;
    const el = playerContainerRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await el.requestFullscreen();
      }
    } catch {
      // ignore
    }
  }, [isClient]);

  return {
    playerContainerRef,
    screenStageContainerRef,
    isPlayerFullscreen,
    isScreenFullscreen,
    fullscreenChatOpen,
    setFullscreenChatOpen,
    togglePlayerFullscreen,
    toggleScreenFullscreen,
  };
}
