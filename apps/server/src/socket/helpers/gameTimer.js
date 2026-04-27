/**
 * Per-game turn timer.
 *
 * When a game session is configured with `turnTimerSeconds`, we run a
 * server-side timeout that auto-skips the current guesser when it expires.
 * The timer is rescheduled on every state-changing handler (guess, skip,
 * round advance, etc.) and cancelled when the round/session is no longer
 * "live".
 *
 * Timer handles live in `state.gameTurnTimers: Map<gameId, Timeout>`.
 * The `turnDeadline` we publish to clients is an absolute server-time ms
 * value; clients compare against their best estimate of server time to draw
 * a countdown. Both `turnDeadline` and `turnTimerSeconds` survive on the
 * `game.session` object so the payload builder can just spread them.
 *
 * Re-entry is safe: scheduleTurnTimer always cancels any pending timer for
 * the same gameId before installing a new one.
 */

const MIN_TURN_TIMER_S = 10;
const MAX_TURN_TIMER_S = 300;

function getTimerMap(state) {
  if (!state.gameTurnTimers) state.gameTurnTimers = new Map();
  return state.gameTurnTimers;
}

function parseTurnTimer(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(MAX_TURN_TIMER_S, Math.max(MIN_TURN_TIMER_S, Math.floor(n)));
}

function cancelTurnTimer(state, gameId) {
  const timers = getTimerMap(state);
  const handle = timers.get(gameId);
  if (handle) {
    clearTimeout(handle);
    timers.delete(gameId);
  }
}

function clearDeadline(game) {
  if (!game) return;
  if (!game.session) game.session = {};
  game.session.turnDeadline = null;
}

/**
 * Cancel any existing turn timer for `gameId`. If the game state is
 * currently in a "live guesser" position, install a fresh one that fires
 * `onTimeout` after `turnTimerSeconds`.
 *
 * No-op (and clears the deadline) if:
 *   - the game has no `turnTimerSeconds` configured
 *   - the session isn't `active`
 *   - the active round is finished
 *   - there's no current guesser to time out
 */
function scheduleTurnTimer(io, state, roomId, gameId, deps = {}) {
  cancelTurnTimer(state, gameId);

  const games = state.roomGames.get(roomId);
  if (!games) return;
  const game = games.get(gameId);
  if (!game || !game.session) return;

  const seconds = game.session.turnTimerSeconds;
  if (!seconds || seconds <= 0) {
    clearDeadline(game);
    return;
  }
  if (game.session.status !== "active") {
    clearDeadline(game);
    return;
  }

  const { getActiveQuestioner, getCurrentGuesserSocketId } =
    deps.gameHelpers || require("./game");

  const questioner = getActiveQuestioner(game);
  if (!questioner) {
    clearDeadline(game);
    return;
  }
  const round = questioner.rounds[questioner.currentRoundIndex];
  if (!round || round.status !== "active") {
    clearDeadline(game);
    return;
  }
  const currentGuesser = getCurrentGuesserSocketId(game);
  if (!currentGuesser) {
    clearDeadline(game);
    return;
  }

  const deadline = Date.now() + seconds * 1000;
  game.session.turnDeadline = deadline;

  const handle = setTimeout(() => {
    onTurnTimeout(io, state, roomId, gameId, deps);
  }, seconds * 1000);
  if (typeof handle.unref === "function") handle.unref();
  getTimerMap(state).set(gameId, handle);
}

function onTurnTimeout(io, state, roomId, gameId, deps = {}) {
  getTimerMap(state).delete(gameId);

  const games = state.roomGames.get(roomId);
  if (!games) return;
  const game = games.get(gameId);
  if (!game || !game.session) return;
  if (game.session.status !== "active") return;

  const { emitGameStateToRoom } = deps.gameHelpers || require("./game");

  // Auto-skip: advance to the next guesser and reschedule.
  game.session.currentGuesserIdx = (game.session.currentGuesserIdx || 0) + 1;
  scheduleTurnTimer(io, state, roomId, gameId, deps);

  if (typeof emitGameStateToRoom === "function") {
    emitGameStateToRoom(io, state, roomId);
  }
}

/**
 * Remove a disconnecting socket from any game in this room. Active
 * questioner stepping out forfeits their remaining rounds and rotates to
 * the next questioner. Current guesser stepping out auto-advances.
 *
 * Returns true when any game was mutated, so the caller can broadcast a
 * fresh `game_state` if desired.
 */
function cleanupDisconnectFromGames(io, state, roomId, socketId) {
  const games = state.roomGames.get(roomId);
  if (!games) return false;

  const { getActiveQuestioner, emitGameStateToRoom } = require("./game");
  let anyChange = false;

  for (const game of games.values()) {
    let changed = false;
    if (!game.session) game.session = {};

    // Drop from participants and observers.
    const pIdx = (game.session.participants || []).indexOf(socketId);
    if (pIdx !== -1) {
      game.session.participants.splice(pIdx, 1);
      changed = true;
    }
    const oIdx = (game.session.observers || []).indexOf(socketId);
    if (oIdx !== -1) {
      game.session.observers.splice(oIdx, 1);
      changed = true;
    }

    if (game.session.status === "active") {
      const aq = getActiveQuestioner(game);
      // The active questioner left mid-session: forfeit the rest of their
      // queue and advance to whichever questioner has rounds left.
      if (aq && aq.socketId === socketId) {
        const round = aq.rounds[aq.currentRoundIndex];
        if (round && round.status === "active") {
          round.status = "finished";
          round.answerMasked = Array.from(round.answer);
        }
        aq.currentRoundIndex = aq.rounds.length;

        let found = false;
        for (let i = 1; i <= game.questioners.length; i++) {
          const nextIdx =
            (game.session.currentQuestionerIdx + i) % game.questioners.length;
          const nextQ = game.questioners[nextIdx];
          if (
            nextQ.socketId !== socketId &&
            nextQ.currentRoundIndex < nextQ.rounds.length
          ) {
            game.session.currentQuestionerIdx = nextIdx;
            game.session.currentGuesserIdx = 0;
            found = true;
            break;
          }
        }
        if (!found) {
          game.session.status = "finished";
        }
        changed = true;
      }
    }

    if (changed) {
      anyChange = true;
      // Reset any pending timeout for this game, then reschedule based on
      // the new state (will no-op if the session ended or there's nobody
      // to time out).
      cancelTurnTimer(state, game.id);
      scheduleTurnTimer(io, state, roomId, game.id);
      if (typeof emitGameStateToRoom === "function") {
        emitGameStateToRoom(io, state, roomId);
      }
    }
  }

  return anyChange;
}

module.exports = {
  MIN_TURN_TIMER_S,
  MAX_TURN_TIMER_S,
  parseTurnTimer,
  cancelTurnTimer,
  scheduleTurnTimer,
  cleanupDisconnectFromGames,
};
