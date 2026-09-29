import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * A callback with a fixed identity that always runs the latest `fn`.
 *
 * The room view re-renders on every playback-position update (~4 Hz), and
 * handlers rebuilt inline on each render defeated React.memo on every panel
 * they reached — profiling showed the header, closed modals and the call
 * sidebar all re-rendering 8x a second for that reason alone.
 *
 * Only for event handlers: the returned function must not be called during
 * render, where it would still see the previous render's `fn`.
 */
export function useStableCallback<Args extends unknown[], R>(
  fn: (...args: Args) => R,
): (...args: Args) => R {
  const ref = useRef(fn);
  useLayoutEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: Args) => ref.current(...args), []);
}
