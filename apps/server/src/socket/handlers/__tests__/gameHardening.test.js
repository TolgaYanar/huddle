const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createSocketState } = require("../../state");
const {
  attachGameHandlers,
  MAX_GAMES_PER_ROOM,
  MAX_EMBEDDED_IMAGE_BYTES_PER_GAME,
  parseRounds,
} = require("../game");
const { attachCupGameHandlers, MAX_CUP_GAMES_PER_ROOM } = require("../cupGame");

function createIo() {
  return {
    sockets: {
      adapter: { rooms: new Map() },
      sockets: new Map(),
    },
  };
}

function createSocket(io, id, roomId = "room") {
  const handlers = new Map();
  const socket = {
    id,
    rooms: new Set([id, roomId]),
    handlers,
    emitted: [],
    on(event, handler) {
      handlers.set(event, handler);
    },
    emit(event, payload) {
      socket.emitted.push({ event, payload });
    },
  };
  io.sockets.sockets.set(id, socket);
  let room = io.sockets.adapter.rooms.get(roomId);
  if (!room) {
    room = new Set();
    io.sockets.adapter.rooms.set(roomId, room);
  }
  room.add(id);
  return socket;
}

function validRounds() {
  return [{ category: "Other", answer: "answer", image: "" }];
}

describe("game allocation limits", () => {
  it("rate-limits regular game creation per connection", () => {
    const io = createIo();
    const state = createSocketState();
    const socket = createSocket(io, "creator");
    attachGameHandlers(io, state, socket);

    for (let i = 0; i < 10; i++) {
      socket.handlers.get("game_create")({
        roomId: "room",
        rounds: validRounds(),
      });
    }

    assert.equal(state.roomGames.get("room").size, 4);
  });

  it("caps regular games across reconnects and creators", () => {
    const io = createIo();
    const state = createSocketState();
    for (let creatorIndex = 0; creatorIndex < 3; creatorIndex++) {
      const socket = createSocket(io, `creator-${creatorIndex}`);
      attachGameHandlers(io, state, socket);
      for (let i = 0; i < 4; i++) {
        socket.handlers.get("game_create")({
          roomId: "room",
          rounds: validRounds(),
        });
      }
    }

    assert.equal(state.roomGames.get("room").size, MAX_GAMES_PER_ROOM);
  });

  it("caps Cup Spider games across reconnects and creators", () => {
    const io = createIo();
    const state = createSocketState();
    for (let creatorIndex = 0; creatorIndex < 3; creatorIndex++) {
      const socket = createSocket(io, `creator-${creatorIndex}`);
      attachCupGameHandlers(io, state, socket);
      for (let i = 0; i < 4; i++) {
        socket.handlers.get("cup_game_create")({ roomId: "room" });
      }
    }

    assert.equal(state.roomCupGames.get("room").size, MAX_CUP_GAMES_PER_ROOM);
  });
});

describe("game deletion authorization", () => {
  it("does not let a room member delete another creator's staged game", () => {
    const io = createIo();
    const state = createSocketState();
    const creator = createSocket(io, "creator");
    const attacker = createSocket(io, "attacker");
    attachGameHandlers(io, state, creator);
    attachGameHandlers(io, state, attacker);
    creator.handlers.get("game_create")({
      roomId: "room",
      rounds: validRounds(),
    });
    const gameId = [...state.roomGames.get("room").keys()][0];

    attacker.handlers.get("game_reset")({ roomId: "room", gameId });

    assert.equal(state.roomGames.get("room").has(gameId), true);
  });

  it("does not let a room member delete another creator's Cup Spider lobby", () => {
    const io = createIo();
    const state = createSocketState();
    const creator = createSocket(io, "creator");
    const attacker = createSocket(io, "attacker");
    attachCupGameHandlers(io, state, creator);
    attachCupGameHandlers(io, state, attacker);
    creator.handlers.get("cup_game_create")({ roomId: "room" });
    const gameId = [...state.roomCupGames.get("room").keys()][0];

    attacker.handlers.get("cup_game_reset")({ roomId: "room", gameId });

    assert.equal(state.roomCupGames.get("room").has(gameId), true);
  });
});

describe("game state broadcast caching", () => {
  it("reuses the public payload without exposing the questioner's answer", () => {
    const io = createIo();
    const state = createSocketState();
    const creator = createSocket(io, "creator");
    const observerA = createSocket(io, "observer-a");
    const observerB = createSocket(io, "observer-b");
    attachGameHandlers(io, state, creator);

    creator.handlers.get("game_create")({
      roomId: "room",
      rounds: validRounds(),
    });

    const creatorPayload = creator.emitted.at(-1).payload;
    const observerAPayload = observerA.emitted.at(-1).payload;
    const observerBPayload = observerB.emitted.at(-1).payload;
    assert.equal(
      creatorPayload.games[0].questioners[0].currentRound.answer,
      "answer",
    );
    assert.equal(
      observerAPayload.games[0].questioners[0].currentRound.answer,
      undefined,
    );
    assert.equal(observerAPayload, observerBPayload);
    assert.notEqual(creatorPayload, observerAPayload);
  });
});

describe("embedded game image budget", () => {
  it("keeps aggregate base64 images within the per-game budget", () => {
    const image = `data:image/png;base64,${"A".repeat(249_000)}`;
    const rounds = new Array(4).fill(null).map((_, index) => ({
      category: "Other",
      answer: `answer-${index}`,
      image,
    }));

    const clean = parseRounds(rounds);
    const embeddedBytes = clean.reduce(
      (total, round) => total + (round.image ? round.image.length : 0),
      0,
    );

    assert.ok(embeddedBytes <= MAX_EMBEDDED_IMAGE_BYTES_PER_GAME);
    assert.equal(clean.filter((round) => round.image).length, 3);
  });

  it("rejects oversized remote image URLs", () => {
    const image = `https://example.com/${"a".repeat(2_100)}`;
    const clean = parseRounds([{ category: "Other", answer: "answer", image }]);

    assert.equal(clean[0].image, "");
  });
});
