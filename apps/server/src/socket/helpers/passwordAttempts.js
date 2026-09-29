// Per-room throttle on wrong room passwords.
//
// join_room's own limiter is per socket, and sockets per client are
// unlimited, so a script could open many sockets and guess a room password at
// the combined rate — each guess also costing a full scrypt. Counting failures
// per room bounds guessing regardless of how many sockets are used. While a
// room is throttled no password is verified at all, which also removes the
// CPU cost. The trade-off is that someone with the right password waits out
// the window during an active attack.
const PASSWORD_FAILURE_WINDOW_MS = 60_000;
const MAX_PASSWORD_FAILURES = 20;

function recentFailures(state, roomId, now) {
  const list = state.roomPasswordFailures.get(roomId);
  if (!list) return null;
  while (list.length > 0 && now - list[0] >= PASSWORD_FAILURE_WINDOW_MS) {
    list.shift();
  }
  if (list.length === 0) {
    state.roomPasswordFailures.delete(roomId);
    return null;
  }
  return list;
}

function isPasswordThrottled(state, roomId, now = Date.now()) {
  const list = recentFailures(state, roomId, now);
  return Boolean(list && list.length >= MAX_PASSWORD_FAILURES);
}

function recordPasswordFailure(state, roomId, now = Date.now()) {
  const list = recentFailures(state, roomId, now) || [];
  list.push(now);
  state.roomPasswordFailures.set(roomId, list);
}

module.exports = {
  PASSWORD_FAILURE_WINDOW_MS,
  MAX_PASSWORD_FAILURES,
  isPasswordThrottled,
  recordPasswordFailure,
};
