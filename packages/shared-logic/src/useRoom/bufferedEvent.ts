export type BufferedEventHandler<T> = (event: T) => void | Promise<void>;

/**
 * Keeps short-lived socket events until the first consumer is ready.
 *
 * Socket.IO can deliver WebRTC signaling immediately after join_room, while
 * React still needs another render to expose the new socket id and attach the
 * call listeners. Losing an offer in that window leaves both peers waiting.
 * This channel is deliberately bounded: signaling is transient and a client
 * that cannot attach after this many events should reconnect instead of
 * growing memory forever.
 */
export function createBufferedEventChannel<T>(maxPending = 100) {
  const handlers = new Set<BufferedEventHandler<T>>();
  const pending: T[] = [];

  const publish = (event: T) => {
    if (handlers.size === 0) {
      if (pending.length >= maxPending) pending.shift();
      pending.push(event);
      return;
    }

    for (const handler of handlers) {
      void handler(event);
    }
  };

  const subscribe = (handler: BufferedEventHandler<T>) => {
    const firstSubscriber = handlers.size === 0;
    handlers.add(handler);

    if (firstSubscriber && pending.length > 0) {
      const queued = pending.splice(0, pending.length);
      for (const event of queued) {
        void handler(event);
      }
    }

    return () => {
      handlers.delete(handler);
    };
  };

  return {
    publish,
    subscribe,
    clear: () => {
      pending.length = 0;
    },
    reset: () => {
      handlers.clear();
      pending.length = 0;
    },
    pendingCount: () => pending.length,
  };
}

export type BufferedEventChannel<T> = ReturnType<
  typeof createBufferedEventChannel<T>
>;
