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

function buildGameStatePayload(state, roomId, forSocketId) {
  const game = state.roomGame.get(roomId);
  if (!game) return { roomId, status: "idle" };

  const isQuestioner = forSocketId === game.questionerId;
  const isFinished = game.status === "finished";

  const turnOrderUsernames = {};
  for (const socketId of game.turnOrder) {
    turnOrderUsernames[socketId] =
      state.socketIdToUsername.get(socketId) || null;
  }

  const winnerUsernames = game.winners.map((id) => ({
    socketId: id,
    username: state.socketIdToUsername.get(id) || null,
  }));

  const currentTurnSocketId =
    game.turnOrder.length > 0
      ? game.turnOrder[game.currentTurnIndex % game.turnOrder.length]
      : null;

  return {
    roomId,
    status: game.status,
    questionerId: game.questionerId,
    questionerName: game.questionerName,
    category: game.category,
    answer: isQuestioner || isFinished ? game.answer : undefined,
    answerMasked: game.answerMasked,
    images: game.images,
    turnOrder: game.turnOrder,
    turnOrderUsernames,
    currentTurnIndex: game.currentTurnIndex,
    currentTurnSocketId,
    guesses: game.guesses,
    hintsRevealed: game.hintsRevealed,
    winners: game.winners,
    winnerUsernames,
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
    if (s) s.emit("game_state", buildGameStatePayload(state, roomId, socketId));
  }
}

function attachGameHandlers(io, state, socket) {
  socket.on("game_get", (data) => {
    const { roomId } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;
    emitGameStateTo(state, socket, roomId);
  });

  socket.on("game_start", (data) => {
    const { roomId, category, answer, images } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;

    if (!answer || typeof answer !== "string") return;
    const cleanAnswer = answer.trim().slice(0, 100);
    if (!cleanAnswer) return;

    const cleanCategory =
      typeof category === "string" && GAME_CATEGORIES.includes(category)
        ? category
        : "Other";

    const cleanImages = Array.isArray(images)
      ? images
          .filter((u) => typeof u === "string" && u.startsWith("http"))
          .slice(0, 5)
      : [];

    const room = io.sockets.adapter.rooms.get(roomId);
    const turnOrder = room
      ? [...room].filter((id) => id !== socket.id)
      : [];

    const username = state.socketIdToUsername.get(socket.id) || null;

    state.roomGame.set(roomId, {
      questionerId: socket.id,
      questionerName: username,
      category: cleanCategory,
      answer: cleanAnswer,
      answerMasked: Array.from(cleanAnswer).map((c) =>
        c === " " ? " " : "_"
      ),
      images: cleanImages,
      turnOrder,
      currentTurnIndex: 0,
      guesses: [],
      hintsRevealed: 0,
      status: "active",
      winners: [],
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
    if (game.turnOrder.length === 0) return;

    const currentPlayerId =
      game.turnOrder[game.currentTurnIndex % game.turnOrder.length];
    if (socket.id !== currentPlayerId) return;

    const cleanGuess =
      typeof guess === "string" ? guess.trim().slice(0, 100) : "";
    if (!cleanGuess) return;

    const username = state.socketIdToUsername.get(socket.id) || null;
    const isCorrect =
      cleanGuess.toLowerCase() === game.answer.toLowerCase();

    game.guesses.push({
      socketId: socket.id,
      username,
      guess: cleanGuess,
      correct: isCorrect,
      turnNumber: game.guesses.length,
    });

    if (isCorrect && !game.winners.includes(socket.id)) {
      game.winners.push(socket.id);
    }

    game.currentTurnIndex++;

    // Auto-end if every player has won
    if (
      game.turnOrder.length > 0 &&
      game.winners.length >= game.turnOrder.length
    ) {
      game.status = "finished";
      game.answerMasked = Array.from(game.answer);
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

    const answerChars = Array.from(game.answer);
    for (let i = 0; i < answerChars.length; i++) {
      if (answerChars[i] === " ") continue;
      if (game.answerMasked[i] !== "_") continue;
      game.answerMasked[i] = answerChars[i];
      game.hintsRevealed++;
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

  socket.on("game_end", (data) => {
    const { roomId } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;

    const game = state.roomGame.get(roomId);
    if (!game) return;
    if (socket.id !== game.questionerId) return;

    game.status = "finished";
    game.answerMasked = Array.from(game.answer);
    emitGameStateToRoom(io, state, roomId);
  });

  socket.on("game_reset", (data) => {
    const { roomId } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;

    const game = state.roomGame.get(roomId);
    if (!game) return;
    if (socket.id !== game.questionerId) return;

    state.roomGame.delete(roomId);
    emitGameStateToRoom(io, state, roomId);
  });
}

module.exports = { attachGameHandlers, GAME_CATEGORIES };
