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
type AudioElementWithSink = HTMLAudioElement & {
  setSinkId?: (deviceId: string) => Promise<void>;
};

export function RemoteAudioSink({
  streams,
  outputDeviceId = "",
}: {
  streams: RemoteStreamEntry[];
  outputDeviceId?: string;
}) {
  const elementsRef = useRef(new Map<string, HTMLAudioElement>());
  const appliedOutputIdsRef = useRef(new Map<string, string>());
  const desiredOutputIdsRef = useRef(new Map<string, string>());
  const outputRequestGenerationsRef = useRef(new Map<string, number>());
  const [blockedIds, setBlockedIds] = useState<Set<string>>(() => new Set());
  const [errorsById, setErrorsById] = useState<Record<string, string>>({});

  const clearProblem = useCallback((id: string) => {
    setBlockedIds((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    setErrorsById((current) => {
      if (!current[id]) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  }, []);

  const tryPlay = useCallback(
    async (id: string, el: HTMLAudioElement, isCurrent: () => boolean) => {
      try {
        await el.play();
        if (!isCurrent()) return false;
        clearProblem(id);
        return true;
      } catch (error) {
        if (!isCurrent()) return false;
        const name = (error as { name?: string } | null)?.name;
        if (name === "AbortError") return false;
        if (name === "NotAllowedError") {
          setBlockedIds((current) => new Set(current).add(id));
        } else {
          setErrorsById((current) => ({
            ...current,
            [id]: "Call audio could not play. Check this tab's sound permission and output device.",
          }));
        }
        return false;
      }
    },
    [clearProblem],
  );

  const configureAndPlay = useCallback(
    async function configureOutputAndPlay(
      id: string,
      element: HTMLAudioElement,
      desiredOutputId: string,
    ) {
      const generation = (outputRequestGenerationsRef.current.get(id) ?? 0) + 1;
      outputRequestGenerationsRef.current.set(id, generation);
      const isCurrent = () =>
        elementsRef.current.get(id) === element &&
        outputRequestGenerationsRef.current.get(id) === generation &&
        desiredOutputIdsRef.current.get(id) === desiredOutputId;
      const el = element as AudioElementWithSink;
      if (desiredOutputId) {
        if (typeof el.setSinkId !== "function") {
          if (!isCurrent()) return false;
          setErrorsById((current) => ({
            ...current,
            [id]: "Speaker selection is not supported in this browser. Use the system default or another browser.",
          }));
          return false;
        }
        try {
          await el.setSinkId(desiredOutputId);
        } catch {
          if (!isCurrent()) return false;
          setErrorsById((current) => ({
            ...current,
            [id]: "The selected speaker is unavailable. Choose another output device and retry audio.",
          }));
          return false;
        }
      } else if (typeof el.setSinkId === "function") {
        try {
          await el.setSinkId("");
        } catch {
          if (!isCurrent()) return false;
          setErrorsById((current) => ({
            ...current,
            [id]: "Call audio could not switch back to the system default. Choose another speaker or retry audio.",
          }));
          return false;
        }
      }

      if (!isCurrent()) {
        // setSinkId() calls can resolve out of order. A stale request still
        // changes the physical output when it eventually finishes, so merely
        // ignoring its result would leave the UI claiming B while audio is
        // routed to A. Re-apply the latest desired output to converge on what
        // the selector currently shows.
        const latestElement = elementsRef.current.get(id);
        const latestOutputId = desiredOutputIdsRef.current.get(id);
        if (
          latestElement === element &&
          latestOutputId !== undefined &&
          latestOutputId !== desiredOutputId
        ) {
          void configureOutputAndPlay(id, element, latestOutputId);
        }
        return false;
      }

      appliedOutputIdsRef.current.set(id, desiredOutputId);
      return tryPlay(id, element, isCurrent);
    },
    [tryPlay],
  );

  const retryAll = useCallback(async () => {
    const results = await Promise.all(
      Array.from(elementsRef.current.entries()).map(([id, el]) =>
        configureAndPlay(
          id,
          el,
          desiredOutputIdsRef.current.get(id) ?? outputDeviceId,
        ),
      ),
    );
    return results.every(Boolean);
  }, [configureAndPlay, outputDeviceId]);

  const blocked = blockedIds.size > 0;
  const hasPlaybackError = Object.keys(errorsById).length > 0;
  const hasProblem = blocked || hasPlaybackError;
  const playbackErrorMessage = Object.values(errorsById)[0];

  // A departed peer must not leave a stale call-audio warning behind. Keep
  // failures keyed by stream rather than one global boolean so one healthy
  // participant cannot accidentally clear another participant's problem.
  useEffect(() => {
    const activeIds = new Set(streams.map(({ id }) => id));
    for (const id of appliedOutputIdsRef.current.keys()) {
      if (!activeIds.has(id)) appliedOutputIdsRef.current.delete(id);
    }
    for (const id of desiredOutputIdsRef.current.keys()) {
      if (!activeIds.has(id)) desiredOutputIdsRef.current.delete(id);
    }
    for (const id of outputRequestGenerationsRef.current.keys()) {
      if (!activeIds.has(id)) outputRequestGenerationsRef.current.delete(id);
    }
    setBlockedIds((current) => {
      const next = new Set([...current].filter((id) => activeIds.has(id)));
      return next.size === current.size ? current : next;
    });
    setErrorsById((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([id]) => activeIds.has(id)),
      );
      return Object.keys(next).length === Object.keys(current).length
        ? current
        : next;
    });
  }, [streams]);

  // A stream may arrive before its audio track does. The element keeps the
  // same srcObject, but if the first play() ran against an empty stream it
  // has to be asked again once there is something to play.
  useEffect(() => {
    const cleanups = streams.map(({ id, stream }) => {
      const onAddTrack = () => {
        const el = elementsRef.current.get(id);
        if (el) {
          void configureAndPlay(
            id,
            el,
            desiredOutputIdsRef.current.get(id) ?? outputDeviceId,
          );
        }
      };
      stream.addEventListener?.("addtrack", onAddTrack);
      return () => stream.removeEventListener?.("addtrack", onAddTrack);
    });
    return () => cleanups.forEach((fn) => fn());
  }, [configureAndPlay, outputDeviceId, streams]);

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
      const previousDesiredOutputId = desiredOutputIdsRef.current.get(id);
      desiredOutputIdsRef.current.set(id, outputDeviceId);
      const streamChanged = el.srcObject !== stream;
      const outputChanged = previousDesiredOutputId !== outputDeviceId;
      if (streamChanged) {
        el.srcObject = stream;
      }
      if (streamChanged || outputChanged) {
        void configureAndPlay(id, el, outputDeviceId);
      }
    },
    [configureAndPlay, outputDeviceId],
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

      {hasProblem && streams.length > 0 && (
        <div
          role="status"
          className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-lg panel flex flex-col items-stretch gap-3 px-4 py-3 sm:flex-row sm:items-center"
        >
          <span className="text-sm text-ink">
            {blocked
              ? "Your browser is holding the call audio until you interact."
              : playbackErrorMessage}
          </span>
          <button
            type="button"
            onClick={() => void retryAll()}
            className="h-9 w-full shrink-0 px-3 rounded-[var(--radius-control)] bg-accent text-accent-ink text-sm font-medium hover:brightness-110 transition-colors sm:w-auto"
          >
            {blocked ? "Enable audio" : "Retry audio"}
          </button>
        </div>
      )}
    </>
  );
}
