const {
  getActiveQuestioner,
  getGuessers,
  getCurrentGuesserSocketId,
  emitGameStateTo,
  emitGameStateToRoom,
} = require("../helpers/game");
const { isCorrectGuess, isNearMiss } = require("../helpers/gameMatch");
const {
  parseTurnTimer,
  cancelTurnTimer,
  scheduleTurnTimer,
} = require("../helpers/gameTimer");

// Turn-cost-per-hint: 0 hints → 1.0 pts, 1 → 0.75, 2 → 0.5, 3+ → 0.25.
function pointsForWin(hintsRevealed) {
  const h = Number.isFinite(hintsRevealed) ? Math.max(0, hintsRevealed) : 0;
  return Math.max(0.25, 1 - 0.25 * h);
}

const GAME_CATEGORIES = [
  "Brands", "People", "Places", "Movies & TV",
  "Music", "Sports", "Animals", "Things", "Other",
];

function makeGameId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function parseRounds(rounds) {
  if (!Array.isArray(rounds) || rounds.length === 0) return null;
  const clean = rounds
    .slice(0, 10)
    .map((r) => {
      if (!r || typeof r.answer !== "string") return null;
      const answer = r.answer.trim().slice(0, 100);
      if (!answer) return null;
      const category =
        typeof r.category === "string" && GAME_CATEGORIES.includes(r.category)
          ? r.category
          : "Other";
      const image =
        typeof r.image === "string" && r.image.startsWith("http")
          ? r.image
          : "";
      return {
        category,
        answer,
        answerMasked: Array.from(answer).map((c) => (c === " " ? " " : "_")),
        hideBlanks: r.hideBlanks === true,
        image,
        guesses: [],
        winners: [],
        winnerUsernames: [],
        hintsRevealed: 0,
        status: "active",
      };
    })
    .filter(Boolean);
  return clean.length > 0 ? clean : null;
}

function getOrCreateRoomGames(state, roomId) {
  if (!state.roomGames.has(roomId)) state.roomGames.set(roomId, new Map());
  return state.roomGames.get(roomId);
}

function isHost(state, roomId, socketId) {
  return state.roomHost.get(roomId) === socketId;
}

function attachGameHandlers(io, state, socket) {
  // ── Get state ──────────────────────────────────────────────────────────────
  socket.on("game_get", (data) => {
    const { roomId } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;
    emitGameStateTo(state, socket, roomId);
  });

  // ── Create a new game (creator stages their own rounds) ────────────────────
  socket.on("game_create", (data) => {
    const { roomId, rounds } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;

    const cleanRounds = parseRounds(rounds);
    if (!cleanRounds) return;

    const username = state.socketIdToUsername.get(socket.id) || null;
    const gameId = makeGameId();

    const turnTimerSeconds = parseTurnTimer(data?.turnTimerSeconds);

    const game = {
      id: gameId,
      creatorId: socket.id,
      questioners: [
        {
          socketId: socket.id,
          username,
          rounds: cleanRounds,
          currentRoundIndex: 0,
        },
      ],
      session: {
        currentQuestionerIdx: 0,
        currentGuesserIdx: 0,
        participants: [],
        observers: [],
        status: "staging",
        startedAt: null,
        turnTimerSeconds,
        turnDeadline: null,
      },
    };

    getOrCreateRoomGames(state, roomId).set(gameId, game);
    emitGameStateToRoom(io, state, roomId);
  });

  // ── Add/replace your rounds in an existing game ────────────────────────────
  socket.on("game_add_rounds", (data) => {
    const { roomId, gameId, rounds } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;

    const games = state.roomGames.get(roomId);
    if (!games) return;
    const game = games.get(gameId);
    if (!game || game.session.status !== "staging") return;

    const cleanRounds = parseRounds(rounds);
    if (!cleanRounds) return;

    const username = state.socketIdToUsername.get(socket.id) || null;
    const existing = game.questioners.findIndex(
      (q) => q.socketId === socket.id
    );
    if (existing !== -1) {
      game.questioners[existing] = {
        socketId: socket.id,
        username,
        rounds: cleanRounds,
        currentRoundIndex: 0,
      };
    } else {
      game.questioners.push({
        socketId: socket.id,
        username,
        rounds: cleanRounds,
        currentRoundIndex: 0,
      });
    }

    emitGameStateToRoom(io, state, roomId);
  });

  // ── Remove your rounds from a game (non-creators only) ────────────────────
  socket.on("game_remove_rounds", (data) => {
    const { roomId, gameId } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;

    const games = state.roomGames.get(roomId);
    if (!games) return;
    const game = games.get(gameId);
    if (!game || game.session.status !== "staging") return;
    if (socket.id === game.creatorId) return; // creator deletes the whole game instead

    const idx = game.questioners.findIndex((q) => q.socketId === socket.id);
    if (idx !== -1) game.questioners.splice(idx, 1);

    emitGameStateToRoom(io, state, roomId);
  });

  // ── Start the session (creator only) ──────────────────────────────────────
  socket.on("session_start", (data) => {
    const { roomId, gameId } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;

    const games = state.roomGames.get(roomId);
    if (!games) return;
    const game = games.get(gameId);
    if (!game || game.session.status !== "staging") return;
    if (socket.id !== game.creatorId && !isHost(state, roomId, socket.id)) return;
    if (game.questioners.length === 0) return;

    const room = io.sockets.adapter.rooms.get(roomId);
    game.session.participants = room ? [...room] : [socket.id];
    game.session.status = "active";
    game.session.startedAt = Date.now();
    game.session.currentQuestionerIdx = 0;
    game.session.currentGuesserIdx = 0;

    scheduleTurnTimer(io, state, roomId, gameId);
    emitGameStateToRoom(io, state, roomId);
  });

  // ── Guess ──────────────────────────────────────────────────────────────────
  socket.on("game_guess", (data) => {
    const { roomId, gameId, guess } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;

    const games = state.roomGames.get(roomId);
    if (!games) return;
    const game = games.get(gameId);
    if (!game || game.session.status !== "active") return;

    const questioner = getActiveQuestioner(game);
    if (!questioner) return;

    const round = questioner.rounds[questioner.currentRoundIndex];
    if (!round || round.status !== "active") return;

    const guessers = getGuessers(game);
    if (guessers.length === 0) return;

    const currentGuesser = getCurrentGuesserSocketId(game);
    if (!currentGuesser || socket.id !== currentGuesser) return;

    const cleanGuess =
      typeof guess === "string" ? guess.trim().slice(0, 100) : "";
    if (!cleanGuess) return;

    const username = state.socketIdToUsername.get(socket.id) || null;
    const isCorrect = isCorrectGuess(cleanGuess, round.answer);
    const nearMiss = !isCorrect && isNearMiss(cleanGuess, round.answer);

    round.guesses.push({
      socketId: socket.id,
      username,
      guess: cleanGuess,
      correct: isCorrect,
      nearMiss,
      turnNumber: round.guesses.length,
    });

    if (isCorrect && !round.winners.includes(socket.id)) {
      round.winners.push(socket.id);
      // Bake in the score *at the moment of winning*, before any further
      // hints are revealed. Faster guessers earn more.
      round.winnerUsernames.push({
        socketId: socket.id,
        username,
        points: pointsForWin(round.hintsRevealed || 0),
      });
    }

    game.session.currentGuesserIdx++;

    // Auto-end round when all guessers have guessed correctly
    if (guessers.length > 0 && round.winners.length >= guessers.length) {
      round.status = "finished";
      round.answerMasked = Array.from(round.answer);
    }

    scheduleTurnTimer(io, state, roomId, gameId);
    emitGameStateToRoom(io, state, roomId);
  });

  // ── Reveal hint (current active questioner only) ───────────────────────────
  socket.on("game_hint", (data) => {
    const { roomId, gameId } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;

    const games = state.roomGames.get(roomId);
    if (!games) return;
    const game = games.get(gameId);
    if (!game || game.session.status !== "active") return;

    const questioner = getActiveQuestioner(game);
    if (!questioner || questioner.socketId !== socket.id) return;

    const round = questioner.rounds[questioner.currentRoundIndex];
    if (!round || round.status !== "active") return;

    const answerChars = Array.from(round.answer);
    for (let i = 0; i < answerChars.length; i++) {
      if (answerChars[i] === " ") continue;
      if (round.answerMasked[i] !== "_") continue;
      round.answerMasked[i] = answerChars[i];
      round.hintsRevealed++;
      break;
    }

    emitGameStateToRoom(io, state, roomId);
  });

  // ── Skip current guesser's turn (active questioner or creator) ─────────────
  socket.on("game_skip_turn", (data) => {
    const { roomId, gameId } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;

    const games = state.roomGames.get(roomId);
    if (!games) return;
    const game = games.get(gameId);
    if (!game || game.session.status !== "active") return;

    const questioner = getActiveQuestioner(game);
    if (!questioner) return;
    if (
      socket.id !== questioner.socketId &&
      socket.id !== game.creatorId &&
      !isHost(state, roomId, socket.id)
    ) return;

    game.session.currentGuesserIdx++;
    scheduleTurnTimer(io, state, roomId, gameId);
    emitGameStateToRoom(io, state, roomId);
  });

  // ── End the current round (active questioner or creator) ──────────────────
  socket.on("game_end_round", (data) => {
    const { roomId, gameId } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;

    const games = state.roomGames.get(roomId);
    if (!games) return;
    const game = games.get(gameId);
    if (!game || game.session.status !== "active") return;

    const questioner = getActiveQuestioner(game);
    if (!questioner) return;
    if (
      socket.id !== questioner.socketId &&
      socket.id !== game.creatorId &&
      !isHost(state, roomId, socket.id)
    ) return;

    const round = questioner.rounds[questioner.currentRoundIndex];
    if (round) {
      round.status = "finished";
      round.answerMasked = Array.from(round.answer);
    }

    scheduleTurnTimer(io, state, roomId, gameId);
    emitGameStateToRoom(io, state, roomId);
  });

  // ── Advance to next round / next questioner (active questioner or creator) ──
  socket.on("game_next_round", (data) => {
    const { roomId, gameId } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;

    const games = state.roomGames.get(roomId);
    if (!games) return;
    const game = games.get(gameId);
    if (!game || game.session.status !== "active") return;

    const questioner = getActiveQuestioner(game);
    if (!questioner) return;
    if (
      socket.id !== questioner.socketId &&
      socket.id !== game.creatorId &&
      !isHost(state, roomId, socket.id)
    ) return;

    questioner.currentRoundIndex++;
    game.session.currentGuesserIdx = 0;

    // Always rotate to the next questioner with remaining rounds (alternating model).
    // If we wrap all the way around and nobody has rounds left, end the session.
    let found = false;
    for (let i = 1; i <= game.questioners.length; i++) {
      const nextIdx =
        (game.session.currentQuestionerIdx + i) % game.questioners.length;
      const nextQ = game.questioners[nextIdx];
      if (nextQ.currentRoundIndex < nextQ.rounds.length) {
        game.session.currentQuestionerIdx = nextIdx;
        found = true;
        break;
      }
    }
    if (!found) {
      game.session.status = "finished";
    }

    scheduleTurnTimer(io, state, roomId, gameId);
    emitGameStateToRoom(io, state, roomId);
  });

  // ── End the session (creator only) ────────────────────────────────────────
  socket.on("session_end", (data) => {
    const { roomId, gameId } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;

    const games = state.roomGames.get(roomId);
    if (!games) return;
    const game = games.get(gameId);
    if (!game) return;
    if (socket.id !== game.creatorId && !isHost(state, roomId, socket.id)) return;

    game.session.status = "finished";
    const questioner = getActiveQuestioner(game);
    if (questioner) {
      const round = questioner.rounds[questioner.currentRoundIndex];
      if (round && round.status !== "finished") {
        round.status = "finished";
        round.answerMasked = Array.from(round.answer);
      }
    }

    cancelTurnTimer(state, gameId);
    game.session.turnDeadline = null;
    emitGameStateToRoom(io, state, roomId);
  });

  // ── Observer toggle (self) ────────────────────────────────────────────────
  // Lets a player opt out of being a guesser without leaving the room. The
  // active questioner can't be an observer (would block the round).
  socket.on("game_set_observer", (data) => {
    const { roomId, gameId, observer } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;
    if (typeof observer !== "boolean") return;

    const games = state.roomGames.get(roomId);
    if (!games) return;
    const game = games.get(gameId);
    if (!game) return;

    if (!Array.isArray(game.session.observers)) game.session.observers = [];
    const observers = game.session.observers;

    if (observer) {
      // Active questioner can't go observer-only mid-round.
      const aq = getActiveQuestioner(game);
      if (game.session.status === "active" && aq && aq.socketId === socket.id) {
        return;
      }
      if (!observers.includes(socket.id)) observers.push(socket.id);
      // If the current guesser just opted out, advance.
      if (
        game.session.status === "active" &&
        getCurrentGuesserSocketId(game) === socket.id
      ) {
        game.session.currentGuesserIdx++;
      }
    } else {
      const idx = observers.indexOf(socket.id);
      if (idx !== -1) observers.splice(idx, 1);
    }

    scheduleTurnTimer(io, state, roomId, gameId);
    emitGameStateToRoom(io, state, roomId);
  });

  // ── Delete/reset a game (creator, or anyone if finished) ──────────────────
  socket.on("game_reset", (data) => {
    const { roomId, gameId } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;

    const games = state.roomGames.get(roomId);
    if (!games) return;
    const game = games.get(gameId);
    if (!game) return;
    if (
      game.session.status === "active" &&
      socket.id !== game.creatorId &&
      !isHost(state, roomId, socket.id)
    ) return;

    cancelTurnTimer(state, gameId);
    games.delete(gameId);
    emitGameStateToRoom(io, state, roomId);
  });
}

module.exports = { attachGameHandlers, GAME_CATEGORIES };
