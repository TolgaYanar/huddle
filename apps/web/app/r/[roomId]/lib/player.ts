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

  const currentMaybe = ref.current as { currentTime?: unknown } | null;
  const ct = currentMaybe?.currentTime;
  if (typeof ct === "number" && !Number.isNaN(ct)) return ct;

  const media = getHtmlMediaElementFromRef(ref);
  const t = media?.currentTime;
  return typeof t === "number" && !Number.isNaN(t) ? t : 0;
}

export function getDurationFromRef(ref: AnyPlayerRef): number {
  const current = ref.current as { getDuration?: unknown } | null;
  if (current && typeof current.getDuration === "function") {
    const d = (current.getDuration as () => unknown)();
    return typeof d === "number" && !Number.isNaN(d) ? d : 0;
  }

  const currentMaybe = ref.current as { duration?: unknown } | null;
  const dur = currentMaybe?.duration;
  if (typeof dur === "number" && !Number.isNaN(dur)) return dur;

  const media = getHtmlMediaElementFromRef(ref);
  const d = media?.duration;
  return typeof d === "number" && !Number.isNaN(d) ? d : 0;
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
  if (media) {
    media.currentTime = seconds;
    return;
  }

  const currentMaybe = ref.current as { currentTime?: unknown } | null;
  if (currentMaybe && "currentTime" in currentMaybe) {
    try {
      (currentMaybe as { currentTime: number }).currentTime = seconds;
    } catch {
      // ignore
    }
  }
}

export async function playFromRef(ref: AnyPlayerRef): Promise<void> {
  const media = getHtmlMediaElementFromRef(ref);
  if (media) {
    try {
      await media.play();
    } catch {
      // ignore autoplay/user-gesture errors
    }
    return;
  }

  const current = ref.current as { play?: unknown } | null;
  if (!current || typeof current.play !== "function") return;

  try {
    await (current.play as () => unknown)();
  } catch {
    // ignore autoplay/user-gesture errors
  }
}

export function pauseFromRef(ref: AnyPlayerRef): void {
  const media = getHtmlMediaElementFromRef(ref);
  if (media) {
    try {
      media.pause();
    } catch {
      // ignore
    }
    return;
  }

  const current = ref.current as { pause?: unknown } | null;
  if (!current || typeof current.pause !== "function") return;
  try {
    (current.pause as () => void)();
  } catch {
    // ignore
  }
}
