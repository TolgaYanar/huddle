const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createSocketState } = require("../../state");
const {
  newGame,
  buildRoomCupGamesPayload,
  emitCupGameStateToRoom,
} = require("../cupGame");

const ROOM = "room";
const SOCKETS = ["alice", "bob", "carol", "spectator"];

function createIo(received) {
  const sockets = new Map();
  for (const id of SOCKETS) {
    sockets.set(id, {
      id,
      emit(event, payload) {
        received.set(id, { event, payload });
      },
    });
  }
  return {
    sockets: {
      sockets,
      adapter: { rooms: new Map([[ROOM, new Set(SOCKETS)]]) },
    },
  };
}

function createGame(state) {
  const usernames = new Map(SOCKETS.map((id) => [id, id.toUpperCase()]));
  state.socketIdToUsername = usernames;
  const game = newGame({
    creatorSocketId: "alice",
    creatorUsername: "ALICE",
    startingLives: 3,
    gridSize: "standard",
    turnTimerSeconds: null,
    roomSocketIds: ["alice", "bob", "carol"],
    usernamesById: usernames,
  });
  state.roomCupGames.set(ROOM, new Map([[game.id, game]]));
  return game;
}

/**
 * emitCupGameStateToRoom shares one "public" payload between every viewer that
 * is not in privateViewerIds. That set is maintained by hand, while the payload
 * itself hides data in several independent places (mineSpider, pendingCard,
 * lastEvent). If the two ever drift apart a viewer silently receives another
 * player's hidden spiders.
 *
 * This asserts the invariant directly: whatever each socket receives must equal
 * the payload built for that socket on its own.
 */
function assertEveryViewerGetsItsOwnView(state, game, label) {
  const received = new Map();
  const io = createIo(received);

  emitCupGameStateToRoom(io, state, ROOM);

  assert.equal(received.size, SOCKETS.length, `${label}: everyone was served`);
  for (const socketId of SOCKETS) {
    const entry = received.get(socketId);
    assert.equal(entry.event, "cup_game_state");
    const expected = buildRoomCupGamesPayload(state, ROOM, socketId);
    // serverNow is sampled per build; normalise it before comparing.
    for (const payload of [entry.payload, expected]) {
      for (const g of payload.games) g.session.serverNow = 0;
    }
    assert.deepEqual(
      entry.payload,
      expected,
      `${label}: ${socketId} received a view built for someone else`,
    );
  }
  return received;
}

describe("Cup Spider broadcast cache keeps per-viewer views correct", () => {
  it("during the placing phase, where every player has private spiders", () => {
    const state = createSocketState();
    const game = createGame(state);
    game.status = "placing";
    game.spiderOwnerByCup.set(0, "alice");
    game.spiderOwnerByCup.set(1, "bob");
    game.spiderOwnerByCup.set(2, "carol");

    const received = assertEveryViewerGetsItsOwnView(state, game, "placing");

    // Sanity-check the property actually has teeth here: alice must see her
    // own cup flagged and must not see bob's.
    const aliceCups = received.get("alice").payload.games[0].cups;
    assert.equal(aliceCups[0].mineSpider, true);
    assert.equal(aliceCups[1].mineSpider, undefined);
    const spectatorCups = received.get("spectator").payload.games[0].cups;
    assert.equal(spectatorCups[0].mineSpider, undefined);
    assert.equal(spectatorCups[1].mineSpider, undefined);
  });

  it("while a relocate source pick is pending", () => {
    const state = createSocketState();
    const game = createGame(state);
    game.status = "playing";
    game.spiderOwnerByCup.set(0, "alice");
    game.pendingCard = {
      kind: "relocate",
      drawerSocketId: "alice",
      awaiting: "pickRelocateSrc",
      srcCupIndex: 0,
    };

    const received = assertEveryViewerGetsItsOwnView(state, game, "relocate");

    const alice = received.get("alice").payload.games[0].session;
    const bob = received.get("bob").payload.games[0].session;
    assert.equal(alice.pendingCard.srcCupIndex, 0);
    assert.equal("srcCupIndex" in bob.pendingCard, false);
  });

  it("after a peek, whose coordinates belong to the drawer alone", () => {
    const state = createSocketState();
    const game = createGame(state);
    game.status = "playing";
    game.lastEvent = {
      kind: "peek",
      drawerSocketId: "bob",
      cupIndex: 4,
      revealedAs: "spider",
    };

    const received = assertEveryViewerGetsItsOwnView(state, game, "peek");

    const bob = received.get("bob").payload.games[0].session;
    const carol = received.get("carol").payload.games[0].session;
    assert.equal(bob.lastEvent.cupIndex, 4);
    assert.equal("cupIndex" in carol.lastEvent, false);
    assert.equal("revealedAs" in carol.lastEvent, false);
  });

  it("in a plain playing state where everyone shares the public view", () => {
    const state = createSocketState();
    const game = createGame(state);
    game.status = "playing";
    game.spiderOwnerByCup.set(0, "alice");

    const received = assertEveryViewerGetsItsOwnView(state, game, "playing");

    // No hidden spiders leak once placement is over — not even to their owner.
    for (const socketId of SOCKETS) {
      const cups = received.get(socketId).payload.games[0].cups;
      assert.equal(cups[0].mineSpider, undefined, socketId);
    }
  });
});
