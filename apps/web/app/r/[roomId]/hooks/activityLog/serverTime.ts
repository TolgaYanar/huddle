export function serverTimeToClientTime(
  serverTimeMs: number,
  serverNowMs: number | undefined,
  receivedAtMs: number,
): number {
  if (typeof serverNowMs !== "number" || !Number.isFinite(serverNowMs)) {
    return receivedAtMs;
  }
  // Approximate the client/server clock offset at receive time.
  // offset ~= clientNow - serverNow
  const offsetMs = receivedAtMs - serverNowMs;
  return serverTimeMs + offsetMs;
}
