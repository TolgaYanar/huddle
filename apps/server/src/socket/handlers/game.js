const GAME_CATEGORIES = [
  "Brands",
  "People",
  "Places",
  "Movies & TV",
  "Music",
  "Sports",
  "Animals",
  "Things",
  "Other",
];

// ─── Payload builder ──────────────────────────────────────────────────────────

function buildRoundPayload(round, isQuestioner) {
  const isFinished = round.status === "finished";
  const blanksVisible =
    isQuestioner || isFinished || !round.hideBlanks || round.hintsRevealed > 0;

  return {
    category: round.category,
    answer: isQuestioner || isFinished ? round.answer : undefined,
    answerMasked: blanksVisible ? round.answerMasked : undefined,
    hideBlanks: round.hideBlanks,
    image: round.image,
    guesses: round.guesses,
    winners: round.winners,
    winnerUsernames: round.winnerUsernames,
    hintsRevealed: round.hintsRevealed,
    status: round.status,
  };
}

function buildScoreboard(game, state) {
  const scoreboard = {};
  for (const round of game.rounds) {
    for (const winnerId of round.winners) {
      if (!scoreboard[winnerId]) {
        scoreboard[winnerId] = {
          username: state.socketIdToUsername.get(winnerId) || null,
          wins: 0,
        };
      }
      scoreboard[winnerId].wins++;
    }
  }
  return scoreboard;
}

function buildGameStatePayload(state, roomId, forSocketId) {
  const game = state.roomGame.get(roomId);
  if (!game) return { roomId, status: "idle" };

  const isQuestioner = forSocketId === game.questionerId;
  const round = game.rounds[game.currentRoundIndex] || null;

  const turnOrderUsernames = {};
  for (const socketId of game.turnOrder) {
    turnOrderUsernames[socketId] =
      state.socketIdToUsername.get(socketId) || null;
  }

  const currentTurnSocketId =
    game.turnOrder.length > 0
      ? game.turnOrder[game.currentTurnIndex % game.turnOrder.length]
      : null;

  return {
    roomId,
    status: game.status,
    questionerId: game.questionerId,
    questionerName: game.questionerName,
    totalRounds: game.rounds.length,
    currentRoundIndex: game.currentRoundIndex,
    currentRound: round ? buildRoundPayload(round, isQuestioner) : null,
    turnOrder: game.turnOrder,
    turnOrderUsernames,
    currentTurnIndex: game.currentTurnIndex,
    currentTurnSocketId,
    scoreboard: buildScoreboard(game, state),
    startedAt: game.startedAt,
  };
}

function emitGameStateTo(state, socket, roomId) {
  socket.emit("game_state", buildGameStatePayload(state, roomId, socket.id));
}

function emitGameStateToRoom(io, state, roomId) {
  const room = io.sockets.adapter.rooms.get(roomId);
  if (!room) return;
  for (const socketId of room) {
    const s = io.sockets.sockets.get(socketId);
    if (s)
      s.emit("game_state", buildGameStatePayload(state, roomId, socketId));
  }
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

function attachGameHandlers(io, state, socket) {
  socket.on("game_get", (data) => {
    const { roomId } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;
    emitGameStateTo(state, socket, roomId);
  });

  // Anyone in the room can start a game (defines all rounds upfront).
  socket.on("game_start", (data) => {
    const { roomId, rounds } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;
    if (!Array.isArray(rounds) || rounds.length === 0) return;

    const cleanRounds = rounds
      .slice(0, 10)
      .map((r) => {
        if (!r || typeof r.answer !== "string") return null;
        const answer = r.answer.trim().slice(0, 100);
        if (!answer) return null;
        const category =
          typeof r.category === "string" &&
          GAME_CATEGORIES.includes(r.category)
            ? r.category
            : "Other";
        const image =
          typeof r.image === "string" && r.image.startsWith("http")
            ? r.image
            : "";
        if (!image) return null;
        return {
          category,
          answer,
          answerMasked: Array.from(answer).map((c) =>
            c === " " ? " " : "_"
          ),
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

    if (cleanRounds.length === 0) return;

    const room = io.sockets.adapter.rooms.get(roomId);
    const turnOrder = room
      ? [...room].filter((id) => id !== socket.id)
      : [];

    const username = state.socketIdToUsername.get(socket.id) || null;

    state.roomGame.set(roomId, {
      questionerId: socket.id,
      questionerName: username,
      rounds: cleanRounds,
      currentRoundIndex: 0,
      turnOrder,
      currentTurnIndex: 0,
      status: "active",
      startedAt: Date.now(),
    });

    emitGameStateToRoom(io, state, roomId);
  });

  socket.on("game_guess", (data) => {
    const { roomId, guess } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;

    const game = state.roomGame.get(roomId);
    if (!game || game.status !== "active") return;

    const round = game.rounds[game.currentRoundIndex];
    if (!round || round.status !== "active") return;
    if (game.turnOrder.length === 0) return;

    const currentPlayerId =
      game.turnOrder[game.currentTurnIndex % game.turnOrder.length];
    if (socket.id !== currentPlayerId) return;

    const cleanGuess =
      typeof guess === "string" ? guess.trim().slice(0, 100) : "";
    if (!cleanGuess) return;

    const username = state.socketIdToUsername.get(socket.id) || null;
    const isCorrect =
      cleanGuess.toLowerCase() === round.answer.toLowerCase();

    round.guesses.push({
      socketId: socket.id,
      username,
      guess: cleanGuess,
      correct: isCorrect,
      turnNumber: round.guesses.length,
    });

    if (isCorrect && !round.winners.includes(socket.id)) {
      round.winners.push(socket.id);
      round.winnerUsernames.push({ socketId: socket.id, username });
    }

    game.currentTurnIndex++;

    // Auto-end round if every player has guessed correctly
    if (
      game.turnOrder.length > 0 &&
      round.winners.length >= game.turnOrder.length
    ) {
      round.status = "finished";
      round.answerMasked = Array.from(round.answer);
      // Auto-end game if this was the last round
      if (game.currentRoundIndex >= game.rounds.length - 1) {
        game.status = "finished";
      }
    }

    emitGameStateToRoom(io, state, roomId);
  });

  socket.on("game_hint", (data) => {
    const { roomId } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;

    const game = state.roomGame.get(roomId);
    if (!game || game.status !== "active") return;
    if (socket.id !== game.questionerId) return;

    const round = game.rounds[game.currentRoundIndex];
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

  socket.on("game_skip_turn", (data) => {
    const { roomId } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;

    const game = state.roomGame.get(roomId);
    if (!game || game.status !== "active") return;
    if (socket.id !== game.questionerId) return;

    game.currentTurnIndex++;
    emitGameStateToRoom(io, state, roomId);
  });

  // Questioner ends the current round (reveals answer, shows results).
  socket.on("game_end_round", (data) => {
    const { roomId } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;

    const game = state.roomGame.get(roomId);
    if (!game || game.status !== "active") return;
    if (socket.id !== game.questionerId) return;

    const round = game.rounds[game.currentRoundIndex];
    if (!round) return;

    round.status = "finished";
    round.answerMasked = Array.from(round.answer);

    if (game.currentRoundIndex >= game.rounds.length - 1) {
      game.status = "finished";
    }

    emitGameStateToRoom(io, state, roomId);
  });

  // Questioner advances to the next round.
  socket.on("game_next_round", (data) => {
    const { roomId } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;

    const game = state.roomGame.get(roomId);
    if (!game) return;
    if (socket.id !== game.questionerId) return;

    game.currentRoundIndex++;
    game.currentTurnIndex = 0;

    if (game.currentRoundIndex >= game.rounds.length) {
      game.status = "finished";
    }

    emitGameStateToRoom(io, state, roomId);
  });

  // End entire game immediately.
  socket.on("game_end", (data) => {
    const { roomId } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;

    const game = state.roomGame.get(roomId);
    if (!game) return;
    if (socket.id !== game.questionerId) return;

    game.status = "finished";
    const round = game.rounds[game.currentRoundIndex];
    if (round) {
      round.status = "finished";
      round.answerMasked = Array.from(round.answer);
    }

    emitGameStateToRoom(io, state, roomId);
  });

  socket.on("game_reset", (data) => {
    const { roomId } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;

    const game = state.roomGame.get(roomId);
    if (!game) return;
    if (game.status === "active" && socket.id !== game.questionerId) return;

    state.roomGame.delete(roomId);
    emitGameStateToRoom(io, state, roomId);
  });
}

module.exports = { attachGameHandlers, GAME_CATEGORIES };
