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
  ref: AnyPlayerRef,
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
  console.log(
    `[PLAYER] seekToFromRef called with ${seconds?.toFixed(2)}s, ref.current=${!!ref.current}`,
  );
  const current = ref.current as { seekTo?: unknown } | null;
  if (current && typeof current.seekTo === "function") {
    console.log(`[PLAYER] Calling seekTo(${seconds?.toFixed(2)}, "seconds")`);
    (current.seekTo as (amount: number, type?: "seconds" | "fraction") => void)(
      seconds,
      "seconds",
    );
    return;
  }

  const media = getHtmlMediaElementFromRef(ref);
  if (media) {
    console.log(`[PLAYER] Setting media.currentTime = ${seconds?.toFixed(2)}`);
    media.currentTime = seconds;
    return;
  }

  const currentMaybe = ref.current as { currentTime?: unknown } | null;
  if (currentMaybe && "currentTime" in currentMaybe) {
    try {
      console.log(
        `[PLAYER] Setting currentTime property = ${seconds?.toFixed(2)}`,
      );
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

  // Some players (e.g., our YouTube IFrame wrapper) expose the IFrame API
  // methods directly on the ref handle.
  const currentWithPlayVideo = ref.current as { playVideo?: unknown } | null;
  if (
    currentWithPlayVideo &&
    typeof currentWithPlayVideo.playVideo === "function"
  ) {
    try {
      (currentWithPlayVideo.playVideo as () => void)();
    } catch {
      // ignore
    }
    return;
  }

  // ReactPlayer YouTube internal is the IFrame API player.
  const internal = getInternalPlayerMaybe(ref) as
    | {
        playVideo?: () => void;
      }
    | null
    | undefined;
  if (internal && typeof internal.playVideo === "function") {
    try {
      internal.playVideo();
    } catch {
      // ignore
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

  // Some players (e.g., our YouTube IFrame wrapper) expose the IFrame API
  // methods directly on the ref handle.
  const currentWithPauseVideo = ref.current as { pauseVideo?: unknown } | null;
  if (
    currentWithPauseVideo &&
    typeof currentWithPauseVideo.pauseVideo === "function"
  ) {
    try {
      (currentWithPauseVideo.pauseVideo as () => void)();
    } catch {
      // ignore
    }
    return;
  }

  // ReactPlayer YouTube internal is the IFrame API player.
  const internal = getInternalPlayerMaybe(ref) as
    | {
        pauseVideo?: () => void;
      }
    | null
    | undefined;
  if (internal && typeof internal.pauseVideo === "function") {
    try {
      internal.pauseVideo();
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
