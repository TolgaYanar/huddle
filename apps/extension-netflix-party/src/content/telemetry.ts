/**
 * Sync-quality telemetry for the extension.
 *
 * Mirrors the web collector: one cumulative, anonymous summary per session,
 * flushed on a timer and on pagehide, with a monotonically increasing sequence
 * so an out-of-order delivery cannot overwrite newer counters.
 *
 * Carries no room id, user id, socket id, content title or watch URL. The
 * session id is random and regenerated whenever the extension reconnects, so
 * rows cannot be joined back to a viewer.
 */

const FLUSH_INTERVAL_MS = 60 * 1000;
const MAX_CLIENT_COUNTER = 100_000;

export type SyncCounter =
  | "playerFound"
  | "playerMissing"
  | "commandsSent"
  | "commandsApplied"
  | "commandsFailed"
  | "joinAttempts"
  | "joinSuccess"
  | "reconnects"
  | "hardSeeks"
  | "catchupExhausted"
  | "autoplayBlocked"
  | "contentMismatch"
  | "driftLt1"
  | "driftLt3"
  | "driftLt5"
  | "driftLt10"
  | "driftGte10";

type Counters = Partial<Record<SyncCounter, number>>;
type TelemetrySender = (payload: string) => Promise<void>;

/**
 * Delivery goes over the socket the extension already holds.
 *
 * A content script's fetch is bound to the page origin (netflix.com), so a
 * direct POST to api.wehuddle.tv is rejected by CORS. A WebSocket handshake is
 * not subject to CORS, which is why this socket already works with no host
 * permission at all — and adding a mandatory one would disable the extension
 * for every existing install until the user re-accepts it in chrome://extensions.
 */
export type TelemetrySocket = {
  connected?: boolean;
  emit: (event: string, payload: unknown) => void;
};

export function createSocketSender(
  getSocket: () => TelemetrySocket | null | undefined,
): TelemetrySender {
  return (payload: string) => {
    const socket = getSocket();
    if (!socket || socket.connected !== true) {
      // Counters are cumulative, so the next flush recovers this one.
      return Promise.reject(new Error("socket_unavailable"));
    }
    try {
      socket.emit("telemetry_sync", JSON.parse(payload));
      return Promise.resolve();
    } catch (error) {
      // A transport implementation must not be able to throw through flush()
      // into playback or a pagehide handler.
      return Promise.reject(error);
    }
  };
}

function newSessionId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Buckets rather than raw positions: a histogram answers "how far off are
 * viewers" without ever storing where anyone was in a title.
 */
function driftBucket(seconds: number): SyncCounter {
  const drift = Math.abs(seconds);
  if (drift < 1) return "driftLt1";
  if (drift < 3) return "driftLt3";
  if (drift < 5) return "driftLt5";
  if (drift < 10) return "driftLt10";
  return "driftGte10";
}

/**
 * The published extension version, so a sync regression can be attributed to
 * a release. Falls back to null rather than throwing in a test environment.
 */
function readRelease(): string | null {
  try {
    return chrome?.runtime?.getManifest?.()?.version ?? null;
  } catch {
    return null;
  }
}

export function createTelemetry(sendPayload: TelemetrySender) {
  let sessionId = newSessionId();
  let counters: Counters = {};
  let sequence = 0;
  let dirty = false;
  let timer: number | null = null;

  function record(counter: SyncCounter, amount = 1) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    const increment = Math.floor(amount);
    if (increment <= 0) return;
    counters[counter] = Math.min(
      MAX_CLIENT_COUNTER,
      (counters[counter] ?? 0) + increment,
    );
    dirty = true;
  }

  function recordDrift(seconds: number) {
    if (!Number.isFinite(seconds)) return;
    record(driftBucket(seconds));
  }

  function flush() {
    if (!dirty) return;

    sequence += 1;
    const flushedSessionId = sessionId;
    const payload = JSON.stringify({
      sessionId,
      source: "extension",
      platform: "netflix",
      release: readRelease(),
      sequence,
      ...counters,
    });
    dirty = false;

    // Counters are cumulative, so a dropped flush is recovered by the next
    // one. Never retry inline: measurement must not compete with playback.
    void sendPayload(payload).catch(() => {
      // A request from the previous connection may fail after rotateSession
      // has installed a fresh session. Do not dirty that new session with an
      // all-zero snapshot belonging to the old one.
      if (sessionId === flushedSessionId) dirty = true;
    });
  }

  /** A reconnect starts a new anonymous session, so counters restart too. */
  function rotateSession() {
    flush();
    sessionId = newSessionId();
    counters = {};
    sequence = 0;
    dirty = false;
  }

  function start() {
    if (timer !== null) return;
    timer = window.setInterval(flush, FLUSH_INTERVAL_MS);
    window.addEventListener("pagehide", flush);
  }

  function stop() {
    if (timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
    window.removeEventListener("pagehide", flush);
    flush();
  }

  return { record, recordDrift, flush, rotateSession, start, stop };
}

export type ExtensionTelemetry = ReturnType<typeof createTelemetry>;
