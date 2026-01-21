import { useCallback } from "react";

import type { AddLogEntry } from "./types";

export function useErrorHandler({
  setPlayerError,
  addLogEntry,
}: {
  setPlayerError: (v: string | null) => void;
  addLogEntry?: AddLogEntry;
}) {
  const handlePlayerError = useCallback(
    (e: unknown) => {
      const maybeErr = e as { name?: string; message?: string } | null;
      if (maybeErr?.name === "AbortError") return;
      if (maybeErr?.message?.includes("interrupted by a call to pause")) return;

      const currentTarget = (e as { currentTarget?: unknown } | null)
        ?.currentTarget;
      const target = (e as { target?: unknown } | null)?.target;
      const el =
        currentTarget instanceof HTMLMediaElement
          ? currentTarget
          : target instanceof HTMLMediaElement
            ? target
            : undefined;

      const mediaError = el?.error;
      const mediaErrorText = mediaError
        ? `MediaError code ${mediaError.code}${mediaError.message ? `: ${mediaError.message}` : ""}`
        : null;

      const message =
        typeof e === "string"
          ? e
          : maybeErr?.message
            ? String(maybeErr.message)
            : mediaErrorText
              ? mediaErrorText
              : "Video failed to load (often CORS/403/unsupported format).";

      console.warn("Player Error:", e);
      setPlayerError(message);
      addLogEntry?.({
        msg: `Player Error: ${message}`,
        type: "error",
        user: "System",
      });
    },
    [addLogEntry, setPlayerError],
  );

  return { handlePlayerError };
}
