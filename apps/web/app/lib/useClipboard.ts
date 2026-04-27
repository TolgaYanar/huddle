"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Copy text to the OS clipboard with a graceful fallback.
 *
 * `navigator.clipboard.writeText` requires a secure context (HTTPS or
 * localhost). On http:// dev hosts and older browsers we fall back to a
 * hidden `<textarea>` + `document.execCommand("copy")`, which is deprecated
 * but still widely supported.
 */
export async function copyText(text: string): Promise<boolean> {
  if (!text) return false;

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to legacy path
    }
  }

  if (typeof document === "undefined") return false;

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    // Avoid triggering a layout shift / scroll jump.
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    textarea.setAttribute("readonly", "");
    textarea.setAttribute("aria-hidden", "true");
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

interface UseClipboardOptions {
  /** Milliseconds the `copied` flag stays true after a successful copy. Defaults to 1200. */
  resetMs?: number;
}

/**
 * Reusable copy-to-clipboard hook. Tracks a transient `copied` flag and any
 * thrown error so the UI can render success/failure feedback.
 */
export function useClipboard({ resetMs = 1200 }: UseClipboardOptions = {}) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const timerRef = useRef<number | null>(null);

  const reset = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setCopied(false);
    setError(null);
  }, []);

  const copy = useCallback(
    async (text: string) => {
      setError(null);
      const ok = await copyText(text);
      if (!ok) {
        setCopied(false);
        setError(new Error("clipboard_unavailable"));
        return false;
      }
      setCopied(true);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        setCopied(false);
        timerRef.current = null;
      }, resetMs);
      return true;
    },
    [resetMs],
  );

  return { copy, copied, error, reset };
}
