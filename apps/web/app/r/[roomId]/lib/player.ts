import type React from "react";

export type AnyPlayerRef = React.RefObject<unknown>;

function isHtmlMediaElement(v: unknown): v is HTMLMediaElement {
  return (
    typeof HTMLMediaElement !== "undefined" && v instanceof HTMLMediaElement
  );
}

function getInternalPlayerMaybe(ref: AnyPlayerRef): unknown {
  const current = ref.current as { getInternalPlayer?: unknown } | null;
  if (!current) return null;
  if (typeof current.getInternalPlayer === "function") {
    return (current.getInternalPlayer as () => unknown)();
  }
  return null;
}

export function getHtmlMediaElementFromRef(
  ref: AnyPlayerRef
): HTMLMediaElement | null {
  const current = ref.current;
  if (isHtmlMediaElement(current)) return current;

  const internal = getInternalPlayerMaybe(ref);
  if (isHtmlMediaElement(internal)) return internal;

  return null;
}

export function getCurrentTimeFromRef(ref: AnyPlayerRef): number {
  const current = ref.current as { getCurrentTime?: unknown } | null;
  if (current && typeof current.getCurrentTime === "function") {
    const t = (current.getCurrentTime as () => unknown)();
    return typeof t === "number" && !Number.isNaN(t) ? t : 0;
  }

  const media = getHtmlMediaElementFromRef(ref);
  const t = media?.currentTime;
  return typeof t === "number" && !Number.isNaN(t) ? t : 0;
}

export function seekToFromRef(ref: AnyPlayerRef, seconds: number): void {
  const current = ref.current as { seekTo?: unknown } | null;
  if (current && typeof current.seekTo === "function") {
    (current.seekTo as (amount: number, type?: "seconds" | "fraction") => void)(
      seconds,
      "seconds"
    );
    return;
  }

  const media = getHtmlMediaElementFromRef(ref);
  if (media) media.currentTime = seconds;
}

export async function playFromRef(ref: AnyPlayerRef): Promise<void> {
  const media = getHtmlMediaElementFromRef(ref);
  if (!media) return;

  try {
    await media.play();
  } catch {
    // ignore autoplay/user-gesture errors
  }
}

export function pauseFromRef(ref: AnyPlayerRef): void {
  const media = getHtmlMediaElementFromRef(ref);
  if (!media) return;
  try {
    media.pause();
  } catch {
    // ignore
  }
}
