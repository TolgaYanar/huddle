"use client";

import React from "react";

const TELEMETRY_ENDPOINT = "/api/telemetry/sync";
const FLUSH_INTERVAL_MS = 60_000;
const MAX_CLIENT_COUNTER = 100_000;

export const SYNC_COUNTERS = [
  "playerFound",
  "playerMissing",
  "commandsSent",
  "commandsApplied",
  "commandsFailed",
  "joinAttempts",
  "joinSuccess",
  "reconnects",
  "hardSeeks",
  "catchupExhausted",
  "autoplayBlocked",
  "contentMismatch",
  "driftLt1",
  "driftLt3",
  "driftLt5",
  "driftLt10",
  "driftGte10",
] as const;

export type SyncCounter = (typeof SYNC_COUNTERS)[number];
type Counters = Record<SyncCounter, number>;

type SyncTelemetry = {
  record: (counter: SyncCounter, amount?: number) => void;
  recordDrift: (seconds: number) => void;
  setPlatform: (platform: string) => void;
  flush: (preferBeacon?: boolean) => void;
};

const noopTelemetry: SyncTelemetry = {
  record: () => {},
  recordDrift: () => {},
  setPlatform: () => {},
  flush: () => {},
};

const SyncTelemetryContext = React.createContext<SyncTelemetry>(noopTelemetry);

function emptyCounters(): Counters {
  return Object.fromEntries(
    SYNC_COUNTERS.map((field) => [field, 0]),
  ) as Counters;
}

function createSessionId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function readRelease(): string | undefined {
  const value = process.env.NEXT_PUBLIC_APP_RELEASE?.trim();
  return value && /^[A-Za-z0-9._-]{1,64}$/.test(value) ? value : undefined;
}

type SessionState = {
  sessionId: string;
  sequence: number;
  platform: string;
  counters: Counters;
  dirty: boolean;
};

function newSession(platform = "other"): SessionState {
  return {
    sessionId: createSessionId(),
    sequence: 0,
    platform,
    counters: emptyCounters(),
    dirty: false,
  };
}

export function SyncTelemetryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const stateRef = React.useRef<SessionState>(newSession());

  const flush = React.useCallback((preferBeacon = false) => {
    const state = stateRef.current;
    if (!state.dirty) return;

    state.sequence += 1;
    const payload = JSON.stringify({
      sessionId: state.sessionId,
      sequence: state.sequence,
      source: "web",
      platform: state.platform,
      release: readRelease(),
      ...state.counters,
    });
    state.dirty = false;

    if (
      preferBeacon &&
      typeof navigator !== "undefined" &&
      typeof navigator.sendBeacon === "function"
    ) {
      const queued = navigator.sendBeacon(
        TELEMETRY_ENDPOINT,
        new Blob([payload], { type: "application/json" }),
      );
      if (!queued) state.dirty = true;
      return;
    }

    void fetch(TELEMETRY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      credentials: "omit",
      keepalive: true,
    }).catch(() => {
      // Preserve the cumulative snapshot for the next scheduled flush. There
      // is no immediate retry loop: measurement must never compete with sync.
      state.dirty = true;
    });
  }, []);

  const record = React.useCallback((counter: SyncCounter, amount = 1) => {
    if (!Number.isFinite(amount) || amount <= 0) return;
    const state = stateRef.current;
    state.counters[counter] = Math.min(
      MAX_CLIENT_COUNTER,
      state.counters[counter] + Math.floor(amount),
    );
    state.dirty = true;
  }, []);

  const recordDrift = React.useCallback(
    (seconds: number) => {
      if (!Number.isFinite(seconds)) return;
      const drift = Math.abs(seconds);
      if (drift < 1) record("driftLt1");
      else if (drift < 3) record("driftLt3");
      else if (drift < 5) record("driftLt5");
      else if (drift < 10) record("driftLt10");
      else record("driftGte10");
    },
    [record],
  );

  const setPlatform = React.useCallback(
    (platform: string) => {
      const next = !platform || platform === "unknown" ? "other" : platform;
      if (stateRef.current.platform === next) return;
      if (
        stateRef.current.sequence === 0 &&
        stateRef.current.platform === "other"
      ) {
        // The room connection can become ready before URL detection runs.
        // Attribute those initial join counters to the first real platform
        // instead of creating a short-lived "other" row on every page load.
        stateRef.current.platform = next;
        return;
      }
      // Counters from different players must not be attributed to whichever
      // platform happened to be active at pagehide. Close the current segment
      // before rotating to a fresh anonymous telemetry session.
      flush();
      stateRef.current = newSession(next);
    },
    [flush],
  );

  React.useEffect(() => {
    const interval = window.setInterval(() => flush(), FLUSH_INTERVAL_MS);
    const onPageHide = () => flush(true);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("pagehide", onPageHide);
      flush(true);
    };
  }, [flush]);

  const value = React.useMemo(
    () => ({ record, recordDrift, setPlatform, flush }),
    [flush, record, recordDrift, setPlatform],
  );

  return (
    <SyncTelemetryContext.Provider value={value}>
      {children}
    </SyncTelemetryContext.Provider>
  );
}

export function useSyncTelemetry(): SyncTelemetry {
  return React.useContext(SyncTelemetryContext);
}

export const syncTelemetryConfig = {
  endpoint: TELEMETRY_ENDPOINT,
  flushIntervalMs: FLUSH_INTERVAL_MS,
};
