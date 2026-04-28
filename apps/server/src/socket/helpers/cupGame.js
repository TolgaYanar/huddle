/**
 * Cup Spider — server state, payload builder, deck, turn rotation, hit
 * resolution, win checks.
 *
 * Game shape (kept fully on the server, sanitized per recipient):
 *   {
 *     id, creatorSocketId,
 *     config: { startingLives, rows, cols, turnTimerSeconds },
 *     status: "lobby" | "placing" | "playing" | "finished",
 *     cups: [{ index, status: "hidden" | "flipped", revealedAs, ownerSocketId? }],
 *     spiderOwnerByCup: Map<cupIndex, ownerSocketId>,  // private
 *     players: [{
 *       socketId, username, lives, eliminated,
 *       spidersPlaced, spiderBudget, isPlacementLocked,
 *       hasMirror, skipNextTurn, isSpectator,
 *       mySpiderCups: Set<cupIndex>,  // mirror of spiderOwnerByCup, indexed by player
 *     }],
 *     turnOrder: [socketId, ...],  // alive non-spectator
 *     currentTurnIdx,
 *     pendingCard: null | { kind, category, drawerSocketId, awaiting, ... },
 *     turnDeadline,
 *     startedAt, endedAt, winnerSocketId, drawWinnerSocketIds,
 *     effectSeq, lastEvent,
 *   }
 *
 * The five-good / five-bad deck is sampled uniformly random on each draw —
 * no luck pointer, no depletion. That keeps the math comprehensible at the
 * table; "the next draw is a 50/50" is the entire model.
 */

const { parseTurnTimer } = require("./gameTimer");

const CARDS = [
  // Bad
  { kind: "flipPlusOne", category: "bad" },
  { kind: "flipPlusTwo", category: "bad" },
  { kind: "flipRow", category: "bad" },
  { kind: "flipBlock", category: "bad" },
  { kind: "skipYourTurn", category: "bad" },
  // Good
  { kind: "forceFlip", category: "good" },
  { kind: "stealTurn", category: "good" },
  { kind: "peek", category: "good" },
  { kind: "relocate", category: "good" },
  { kind: "mirror", category: "good" },
];

const MIN_LIVES = 1;
const MAX_LIVES = 5;

function clampLives(value, fallback = 3) {
  if (value === null || value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(MIN_LIVES, Math.min(MAX_LIVES, Math.floor(n)));
}

function getOrCreateRoomCupGames(state, roomId) {
  if (!state.roomCupGames.has(roomId)) state.roomCupGames.set(roomId, new Map());
  return state.roomCupGames.get(roomId);
}

/**
 * Pick a grid that keeps ≥40% of cups empty even if every player maxes out
 * their spider budget. Numbers tuned so no reasonable lobby ever feels like
 * "every flip is a spider."
 */
function pickGridForPlayers(playerCount, sizePref) {
  const choose = (compact, standard, large) => {
    if (sizePref === "compact") return compact;
    if (sizePref === "large") return large;
    return standard;
  };
  if (playerCount <= 2) return choose({ rows: 4, cols: 4 }, { rows: 4, cols: 4 }, { rows: 5, cols: 5 });
  if (playerCount === 3) return choose({ rows: 4, cols: 4 }, { rows: 4, cols: 5 }, { rows: 5, cols: 6 });
  if (playerCount === 4) return choose({ rows: 4, cols: 5 }, { rows: 5, cols: 6 }, { rows: 6, cols: 6 });
  if (playerCount === 5) return choose({ rows: 5, cols: 6 }, { rows: 6, cols: 6 }, { rows: 6, cols: 7 });
  if (playerCount === 6) return choose({ rows: 5, cols: 7 }, { rows: 6, cols: 7 }, { rows: 7, cols: 7 });
  return choose({ rows: 6, cols: 7 }, { rows: 7, cols: 7 }, { rows: 7, cols: 8 });
}

function makeGameId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function makeCups(rows, cols) {
  const total = rows * cols;
  const cups = new Array(total);
  for (let i = 0; i < total; i++) {
    cups[i] = { index: i, status: "hidden", revealedAs: undefined, ownerSocketId: undefined };
  }
  return cups;
}

function makePlayer(socketId, username, startingLives, isSpectator = false) {
  return {
    socketId,
    username,
    lives: startingLives,
    eliminated: false,
    spidersPlaced: 0,
    spiderBudget: startingLives,
    isPlacementLocked: false,
    hasMirror: false,
    skipNextTurn: false,
    isSpectator,
    mySpiderCups: new Set(),
  };
}

function newGame({ creatorSocketId, creatorUsername, startingLives, gridSize, turnTimerSeconds, roomSocketIds, usernamesById }) {
  const lives = clampLives(startingLives);
  const grid = pickGridForPlayers(roomSocketIds.length || 2, gridSize);
  const cups = makeCups(grid.rows, grid.cols);
  const players = [];
  for (const sid of roomSocketIds) {
    const username = usernamesById.get(sid) || null;
    players.push(makePlayer(sid, username, lives, false));
  }
  // Ensure creator is always represented even if not yet in the room map.
  if (!players.some((p) => p.socketId === creatorSocketId)) {
    players.push(makePlayer(creatorSocketId, creatorUsername, lives, false));
  }
  return {
    id: makeGameId(),
    creatorSocketId,
    config: {
      startingLives: lives,
      rows: grid.rows,
      cols: grid.cols,
      turnTimerSeconds: parseTurnTimer(turnTimerSeconds),
    },
    status: "lobby",
    cups,
    spiderOwnerByCup: new Map(),
    players,
    turnOrder: [],
    currentTurnIdx: 0,
    pendingCard: null,
    turnDeadline: null,
    startedAt: null,
    endedAt: null,
    winnerSocketId: null,
    drawWinnerSocketIds: [],
    effectSeq: 0,
    lastEvent: null,
  };
}

function getPlayer(game, socketId) {
  return game.players.find((p) => p.socketId === socketId) || null;
}

function ensurePlayer(game, socketId, username) {
  let p = getPlayer(game, socketId);
  if (p) return p;
  // Late joiner during a session becomes a spectator. Pre-game (lobby/placing
  // before placement is active) joiners become regular players.
  const spectator = game.status === "playing" || game.status === "placing";
  p = makePlayer(socketId, username, game.config.startingLives, spectator);
  game.players.push(p);
  return p;
}

/**
 * The ordered list of socket ids whose turn is "in play" — alive,
 * non-spectator, non-eliminated. We keep this snapshot stable inside a game
 * so spectators joining mid-session never sneak into the rotation.
 */
function alivePlayers(game) {
  return game.players.filter((p) => !p.isSpectator && !p.eliminated);
}

function buildTurnOrder(game) {
  return alivePlayers(game).map((p) => p.socketId);
}

function getCurrentTurnSocketId(game) {
  const order = game.turnOrder;
  if (!order || order.length === 0) return null;
  // Skip eliminated players in case rotation lags behind elimination.
  for (let i = 0; i < order.length; i++) {
    const idx = (game.currentTurnIdx + i) % order.length;
    const sid = order[idx];
    const p = getPlayer(game, sid);
    if (p && !p.eliminated) return sid;
  }
  return null;
}

function advanceTurn(game) {
  const order = game.turnOrder;
  if (!order || order.length === 0) return;
  // Move the pointer to the next *alive* player; consume a skipNextTurn flag
  // along the way so a "skip" feels like a turn really vanished.
  let safety = order.length * 2;
  while (safety-- > 0) {
    game.currentTurnIdx = (game.currentTurnIdx + 1) % order.length;
    const sid = order[game.currentTurnIdx];
    const p = getPlayer(game, sid);
    if (!p || p.eliminated) continue;
    if (p.skipNextTurn) {
      p.skipNextTurn = false;
      pushEvent(game, { kind: "skip", targetSocketId: sid, reason: "scheduled" });
      continue;
    }
    return;
  }
}

function pushEvent(game, event) {
  game.effectSeq = (game.effectSeq || 0) + 1;
  game.lastEvent = event;
}

function drawCard(game) {
  const idx = Math.floor(Math.random() * CARDS.length);
  return CARDS[idx];
}

/**
 * Resolve a spider hit on `victimSocketId`.
 *
 * If the victim has a Mirror charge AND the spider's owner is someone else,
 * the Mirror is consumed and the *owner* takes the hit instead. Self-flips
 * are exempt — you can't reflect a hit you caused yourself, so the Mirror
 * stays up and the flipper takes the hit normally.
 *
 * Returns { hit, mirroredTo }:
 *   - hit       — true when the victim actually lost a life
 *   - mirroredTo — set when the hit was redirected; the spider's owner is
 *                  the one who lost a life
 */
function applyHit(game, victimSocketId, spiderOwnerSocketId) {
  const p = getPlayer(game, victimSocketId);
  if (!p || p.eliminated) return { hit: false, mirroredTo: null };

  if (p.hasMirror && spiderOwnerSocketId && spiderOwnerSocketId !== victimSocketId) {
    p.hasMirror = false;
    const owner = getPlayer(game, spiderOwnerSocketId);
    if (owner && !owner.eliminated) {
      owner.lives = Math.max(0, owner.lives - 1);
      if (owner.lives <= 0) {
        owner.eliminated = true;
        pushEvent(game, { kind: "eliminate", socketId: spiderOwnerSocketId });
      }
    }
    return { hit: false, mirroredTo: spiderOwnerSocketId };
  }

  p.lives = Math.max(0, p.lives - 1);
  if (p.lives <= 0) {
    p.eliminated = true;
    pushEvent(game, { kind: "eliminate", socketId: victimSocketId });
  }
  return { hit: true, mirroredTo: null };
}

function flipCupLowLevel(game, cupIndex, flipperSocketId) {
  const cup = game.cups[cupIndex];
  if (!cup || cup.status !== "hidden") return null;
  cup.status = "flipped";
  const ownerSocketId = game.spiderOwnerByCup.get(cupIndex) || null;
  const wasSpider = !!ownerSocketId;
  cup.revealedAs = wasSpider ? "spider" : "empty";
  if (wasSpider) {
    cup.ownerSocketId = ownerSocketId;
    // Owner loses the spider from their personal set.
    const owner = getPlayer(game, ownerSocketId);
    if (owner) owner.mySpiderCups.delete(cupIndex);
    game.spiderOwnerByCup.delete(cupIndex);
  }
  let result = { hit: false, mirroredTo: null };
  if (wasSpider) {
    result = applyHit(game, flipperSocketId, ownerSocketId);
  }
  pushEvent(game, {
    kind: "flip",
    cupIndex,
    revealedAs: cup.revealedAs,
    flipperSocketId,
    ownerSocketId: ownerSocketId || undefined,
    hit: result.hit,
    mirroredTo: result.mirroredTo || undefined,
  });
  return { wasSpider, ...result, ownerSocketId };
}

function checkEndConditions(game) {
  if (game.status !== "playing") return;
  const aliveSockets = alivePlayers(game).map((p) => p.socketId);
  if (aliveSockets.length <= 1) {
    game.status = "finished";
    game.endedAt = Date.now();
    if (aliveSockets.length === 1) {
      game.winnerSocketId = aliveSockets[0];
      pushEvent(game, { kind: "win", socketId: aliveSockets[0] });
    } else {
      game.winnerSocketId = null;
    }
    game.pendingCard = null;
    game.turnDeadline = null;
    return;
  }
  if (game.spiderOwnerByCup.size === 0) {
    // All spiders found; the game is decided by who has the most lives.
    let max = -Infinity;
    for (const sid of aliveSockets) {
      const p = getPlayer(game, sid);
      if (p && p.lives > max) max = p.lives;
    }
    const winners = aliveSockets.filter((sid) => {
      const p = getPlayer(game, sid);
      return p && p.lives === max;
    });
    game.status = "finished";
    game.endedAt = Date.now();
    if (winners.length === 1) {
      game.winnerSocketId = winners[0];
      pushEvent(game, { kind: "win", socketId: winners[0] });
    } else {
      game.winnerSocketId = null;
      game.drawWinnerSocketIds = winners;
      pushEvent(game, { kind: "draw_end", reason: "all_spiders_found" });
    }
    game.pendingCard = null;
    game.turnDeadline = null;
  }
}

function clearPendingCardIfDone(game) {
  if (!game.pendingCard) return;
  // Some cards (flipPlusTwo) keep awaiting until remainingFlips reaches 0.
  if (game.pendingCard.remainingFlips && game.pendingCard.remainingFlips > 0) return;
  game.pendingCard = null;
}

// ── Per-viewer payload builder ───────────────────────────────────────────────

function buildCupGamePayload(state, game, forSocketId) {
  // `mineSpider` surfaces in two situations:
  //   1. During the placement phase — players need to see what they've put
  //      down so they can plan and remember.
  //   2. During the relocate source-pick step — the drawer needs to see
  //      which cups are theirs to choose from.
  //
  // Once the game enters the playing phase, every hidden cup looks identical
  // to every viewer (including the owner). That's the memory test.
  const isPlacementPhase = game.status === "placing";
  const isAwaitingMyRelocateSrc =
    !!game.pendingCard &&
    game.pendingCard.drawerSocketId === forSocketId &&
    game.pendingCard.awaiting === "pickRelocateSrc";
  const showMineHints = isPlacementPhase || isAwaitingMyRelocateSrc;

  const cups = game.cups.map((cup) => {
    if (cup.status === "flipped") {
      return {
        index: cup.index,
        status: "flipped",
        revealedAs: cup.revealedAs,
        ownerSocketId: cup.ownerSocketId,
      };
    }
    const out = { index: cup.index, status: "hidden" };
    if (showMineHints) {
      const ownerSid = game.spiderOwnerByCup.get(cup.index);
      if (ownerSid && ownerSid === forSocketId) out.mineSpider = true;
    }
    return out;
  });

  const players = game.players.map((p) => ({
    socketId: p.socketId,
    username: state.socketIdToUsername.get(p.socketId) || p.username || null,
    lives: p.lives,
    eliminated: p.eliminated,
    spidersPlaced: p.spidersPlaced,
    spiderBudget: p.spiderBudget,
    isPlacementLocked: p.isPlacementLocked,
    hasMirror: p.hasMirror,
    skipNextTurn: p.skipNextTurn,
    isSpectator: p.isSpectator,
  }));

  const session = {
    status: game.status,
    turnOrder: [...(game.turnOrder || [])],
    currentTurnSocketId: getCurrentTurnSocketId(game),
    pendingCard: game.pendingCard ? { ...game.pendingCard } : null,
    turnDeadline: game.turnDeadline ?? null,
    serverNow: Date.now(),
    winnerSocketId: game.winnerSocketId ?? null,
    drawWinnerSocketIds: Array.isArray(game.drawWinnerSocketIds)
      ? [...game.drawWinnerSocketIds]
      : [],
    effectSeq: game.effectSeq || 0,
    lastEvent: game.lastEvent || null,
  };

  return {
    gameId: game.id,
    creatorSocketId: game.creatorSocketId,
    creatorName: state.socketIdToUsername.get(game.creatorSocketId) || null,
    config: { ...game.config },
    cups,
    players,
    session,
    startedAt: game.startedAt,
    endedAt: game.endedAt,
  };
}

function buildRoomCupGamesPayload(state, roomId, forSocketId) {
  const games = state.roomCupGames.get(roomId);
  const list = games ? [...games.values()] : [];
  return {
    roomId,
    games: list.map((g) => buildCupGamePayload(state, g, forSocketId)),
  };
}

function emitCupGameStateTo(state, socket, roomId) {
  socket.emit("cup_game_state", buildRoomCupGamesPayload(state, roomId, socket.id));
}

function emitCupGameStateToRoom(io, state, roomId) {
  const room = io.sockets.adapter.rooms.get(roomId);
  if (!room) return;
  for (const socketId of room) {
    const s = io.sockets.sockets.get(socketId);
    if (s) s.emit("cup_game_state", buildRoomCupGamesPayload(state, roomId, socketId));
  }
}

// ── Disconnect cleanup ───────────────────────────────────────────────────────

function cleanupDisconnectFromCupGames(io, state, roomId, socketId) {
  const games = state.roomCupGames.get(roomId);
  if (!games) return false;
  let anyChange = false;
  for (const game of games.values()) {
    const p = getPlayer(game, socketId);
    if (!p) continue;
    if (game.status === "lobby") {
      // Drop them entirely from the lobby.
      game.players = game.players.filter((x) => x.socketId !== socketId);
      anyChange = true;
      continue;
    }
    if (game.status === "placing") {
      // Forfeit any spiders they placed; remove them.
      for (const cupIdx of [...p.mySpiderCups]) game.spiderOwnerByCup.delete(cupIdx);
      game.players = game.players.filter((x) => x.socketId !== socketId);
      anyChange = true;
      continue;
    }
    if (game.status === "playing") {
      // Treat as an immediate elimination: drop their lives, drop their
      // spiders (cups become empty), advance turn if it was theirs.
      if (!p.eliminated) {
        p.eliminated = true;
        pushEvent(game, { kind: "eliminate", socketId });
        anyChange = true;
      }
      for (const cupIdx of [...p.mySpiderCups]) {
        game.spiderOwnerByCup.delete(cupIdx);
        p.mySpiderCups.delete(cupIdx);
      }
      // Drop from turn order so rotation skips them naturally.
      const oIdx = game.turnOrder.indexOf(socketId);
      if (oIdx !== -1) {
        game.turnOrder.splice(oIdx, 1);
        if (game.currentTurnIdx >= game.turnOrder.length) game.currentTurnIdx = 0;
      }
      // If the disconnect happened while they were holding a pending card,
      // void it so the table isn't stuck.
      if (game.pendingCard && game.pendingCard.drawerSocketId === socketId) {
        game.pendingCard = null;
      }
      checkEndConditions(game);
    }
  }
  if (anyChange) emitCupGameStateToRoom(io, state, roomId);
  return anyChange;
}

// ── Turn timer (per cup-spider game) ────────────────────────────────────────

function getCupTimerMap(state) {
  if (!state.cupGameTurnTimers) state.cupGameTurnTimers = new Map();
  return state.cupGameTurnTimers;
}

function cancelCupTurnTimer(state, gameId) {
  const timers = getCupTimerMap(state);
  const handle = timers.get(gameId);
  if (handle) {
    clearTimeout(handle);
    timers.delete(gameId);
  }
}

function scheduleCupTurnTimer(io, state, roomId, gameId) {
  cancelCupTurnTimer(state, gameId);
  const games = state.roomCupGames.get(roomId);
  if (!games) return;
  const game = games.get(gameId);
  if (!game) return;
  if (game.status !== "playing") {
    game.turnDeadline = null;
    return;
  }
  const seconds = game.config.turnTimerSeconds;
  if (!seconds || seconds <= 0) {
    game.turnDeadline = null;
    return;
  }
  const deadline = Date.now() + seconds * 1000;
  game.turnDeadline = deadline;
  const handle = setTimeout(() => {
    onCupTurnTimeout(io, state, roomId, gameId);
  }, seconds * 1000);
  if (typeof handle.unref === "function") handle.unref();
  getCupTimerMap(state).set(gameId, handle);
}

function onCupTurnTimeout(io, state, roomId, gameId) {
  getCupTimerMap(state).delete(gameId);
  const games = state.roomCupGames.get(roomId);
  if (!games) return;
  const game = games.get(gameId);
  if (!game || game.status !== "playing") return;
  // If a card is mid-resolution, cancel it cleanly so the table can move on.
  if (game.pendingCard) game.pendingCard = null;
  advanceTurn(game);
  scheduleCupTurnTimer(io, state, roomId, gameId);
  emitCupGameStateToRoom(io, state, roomId);
}

module.exports = {
  CARDS,
  MIN_LIVES,
  MAX_LIVES,
  clampLives,
  getOrCreateRoomCupGames,
  pickGridForPlayers,
  newGame,
  getPlayer,
  ensurePlayer,
  alivePlayers,
  buildTurnOrder,
  getCurrentTurnSocketId,
  advanceTurn,
  pushEvent,
  drawCard,
  applyHit,
  flipCupLowLevel,
  checkEndConditions,
  clearPendingCardIfDone,
  buildCupGamePayload,
  buildRoomCupGamesPayload,
  emitCupGameStateTo,
  emitCupGameStateToRoom,
  cleanupDisconnectFromCupGames,
  scheduleCupTurnTimer,
  cancelCupTurnTimer,
};
