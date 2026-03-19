function getActiveQuestioner(game) {
  return game.questioners[game.session.currentQuestionerIdx] || null;
}

function getGuessers(game) {
  const aq = getActiveQuestioner(game);
  if (!aq) return [];
  return game.session.participants.filter((id) => id !== aq.socketId);
}

function getCurrentGuesserSocketId(game) {
  const guessers = getGuessers(game);
  if (guessers.length === 0) return null;

  // Skip players who have already guessed correctly this round
  const questioner = getActiveQuestioner(game);
  const round = questioner ? questioner.rounds[questioner.currentRoundIndex] : null;
  const winners = round ? new Set(round.winners) : new Set();
  const remaining = guessers.filter((id) => !winners.has(id));
  if (remaining.length === 0) return null;

  return remaining[game.session.currentGuesserIdx % remaining.length];
}

function buildRoundPayload(round, isQuestioner) {
  if (!round) return null;
  const finished = round.status === "finished";
  const revealAnswer = isQuestioner || finished;
  const blanksVisible =
    isQuestioner || finished || !round.hideBlanks || round.hintsRevealed > 0;
  return {
    category: round.category,
    answer: revealAnswer ? round.answer : undefined,
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

function buildGamePayload(state, game, forSocketId) {
  const activeQuestioner = getActiveQuestioner(game);
  const currentGuesserSocketId = getCurrentGuesserSocketId(game);

  const participantUsernames = {};
  for (const socketId of game.session.participants) {
    participantUsernames[socketId] =
      state.socketIdToUsername.get(socketId) || null;
  }

  const scoreboard = {};
  for (const q of game.questioners) {
    for (const round of q.rounds) {
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
  }

  const questioners = game.questioners.map((q, idx) => {
    const isThisQuestioner = q.socketId === forSocketId;
    const isActive = idx === game.session.currentQuestionerIdx;
    const round = q.rounds[q.currentRoundIndex] || null;
    return {
      socketId: q.socketId,
      username: q.username,
      totalRounds: q.rounds.length,
      currentRoundIndex: q.currentRoundIndex,
      currentRound: buildRoundPayload(round, isThisQuestioner),
      isDone: q.currentRoundIndex >= q.rounds.length,
      isActive,
    };
  });

  return {
    gameId: game.id,
    creatorId: game.creatorId,
    creatorName: state.socketIdToUsername.get(game.creatorId) || null,
    status: game.session.status,
    startedAt: game.session.startedAt,
    questioners,
    session: {
      currentQuestionerIdx: game.session.currentQuestionerIdx,
      currentQuestionerId: activeQuestioner ? activeQuestioner.socketId : null,
      currentQuestionerName: activeQuestioner ? activeQuestioner.username : null,
      currentGuesserSocketId,
      participants: game.session.participants,
      participantUsernames,
    },
    scoreboard,
  };
}

function buildRoomGamesPayload(state, roomId, forSocketId) {
  const games = state.roomGames.get(roomId);
  const gameList = games ? [...games.values()] : [];
  return {
    roomId,
    games: gameList.map((g) => buildGamePayload(state, g, forSocketId)),
  };
}

function emitGameStateTo(state, socket, roomId) {
  socket.emit("game_state", buildRoomGamesPayload(state, roomId, socket.id));
}

function emitGameStateToRoom(io, state, roomId) {
  const room = io.sockets.adapter.rooms.get(roomId);
  if (!room) return;
  for (const socketId of room) {
    const s = io.sockets.sockets.get(socketId);
    if (s)
      s.emit("game_state", buildRoomGamesPayload(state, roomId, socketId));
  }
}

module.exports = {
  getActiveQuestioner,
  getGuessers,
  getCurrentGuesserSocketId,
  buildRoomGamesPayload,
  emitGameStateTo,
  emitGameStateToRoom,
};
