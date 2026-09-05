"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

import type { RemoteStreamEntry } from "../types";

/*
 * The one place remote voice is played.
 *
 * It used to live inside each participant's tile. That tied hearing someone
 * to a piece of UI that unmounts in ordinary use: collapsing the call panel
 * or entering theatre mode removed the <audio> elements, and the room went
 * silent while every peer connection stayed healthy. Nothing failed, nothing
 * was logged — the packets simply had nowhere to go.
 *
 * This sink is mounted at the room root and never unmounts while the room is
 * open, so playback no longer depends on what the user happens to be looking
 * at. The tiles keep their muted <video> for the picture and nothing else.
 *
 * It also handles the second silent failure: a listener who has not clicked
 * anything yet. Browsers refuse to start audible playback without a user
 * gesture, play() rejects with NotAllowedError, and the old code swallowed it.
 * When that happens this component shows a control that IS the gesture, and
 * additionally retries on the next click or key press anywhere on the page.
 */
export function RemoteAudioSink({ streams }: { streams: RemoteStreamEntry[] }) {
  const elementsRef = useRef(new Map<string, HTMLAudioElement>());
  const [blocked, setBlocked] = useState(false);

  const tryPlay = useCallback(async (el: HTMLAudioElement) => {
    try {
      await el.play();
      return true;
    } catch (error) {
      const name = (error as { name?: string } | null)?.name;
      // Anything other than the autoplay gate (an AbortError from a srcObject
      // swap, for instance) is transient and not the user's problem to fix.
      if (name === "NotAllowedError") setBlocked(true);
      return false;
    }
  }, []);

  const retryAll = useCallback(async () => {
    const results = await Promise.all(
      Array.from(elementsRef.current.values()).map((el) => tryPlay(el)),
    );
    if (results.every(Boolean)) setBlocked(false);
  }, [tryPlay]);

  // A stream may arrive before its audio track does. The element keeps the
  // same srcObject, but if the first play() ran against an empty stream it
  // has to be asked again once there is something to play.
  useEffect(() => {
    const cleanups = streams.map(({ id, stream }) => {
      const onAddTrack = () => {
        const el = elementsRef.current.get(id);
        if (el) void tryPlay(el);
      };
      stream.addEventListener?.("addtrack", onAddTrack);
      return () => stream.removeEventListener?.("addtrack", onAddTrack);
    });
    return () => cleanups.forEach((fn) => fn());
  }, [streams, tryPlay]);

  // Once blocked, the next real gesture anywhere on the page is enough to
  // unlock playback — the user should not have to find the button if they
  // were about to click something else anyway.
  useEffect(() => {
    if (!blocked) return;
    const unlock = () => void retryAll();
    document.addEventListener("pointerdown", unlock, { capture: true });
    document.addEventListener("keydown", unlock, { capture: true });
    return () => {
      document.removeEventListener("pointerdown", unlock, { capture: true });
      document.removeEventListener("keydown", unlock, { capture: true });
    };
  }, [blocked, retryAll]);

  const bindElement = useCallback(
    (id: string, stream: MediaStream) => (el: HTMLAudioElement | null) => {
      if (!el) {
        elementsRef.current.delete(id);
        return;
      }
      elementsRef.current.set(id, el);
      if (el.srcObject !== stream) {
        el.srcObject = stream;
        void tryPlay(el);
      }
    },
    [tryPlay],
  );

  return (
    <>
      {streams.map(({ id, stream }) => (
        <audio
          key={id}
          ref={bindElement(id, stream)}
          autoPlay
          data-remote-audio={id}
          className="hidden"
        />
      ))}

      {blocked && streams.length > 0 && (
        <div
          role="status"
          className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 panel flex items-center gap-3 px-4 py-2.5"
        >
          <span className="text-sm text-ink">
            Your browser is holding the call audio until you interact.
          </span>
          <button
            type="button"
            onClick={() => void retryAll()}
            className="h-9 px-3 rounded-[var(--radius-control)] bg-accent text-accent-ink text-sm font-medium hover:brightness-110 transition-colors"
          >
            Enable audio
          </button>
        </div>
      )}
    </>
  );
}
