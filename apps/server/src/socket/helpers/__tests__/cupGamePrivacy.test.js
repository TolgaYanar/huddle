const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createSocketState } = require("../../state");
const { newGame, buildCupGamePayload } = require("../cupGame");

function createPlayingGame() {
  const usernames = new Map([
    ["drawer", "Drawer"],
    ["opponent", "Opponent"],
  ]);
  const game = newGame({
    creatorSocketId: "drawer",
    creatorUsername: "Drawer",
    startingLives: 3,
    gridSize: "standard",
    turnTimerSeconds: null,
    roomSocketIds: ["drawer", "opponent"],
    usernamesById: usernames,
  });
  game.status = "playing";
  return { game, usernames };
}

describe("Cup Spider per-viewer privacy", () => {
  it("only reveals a pending relocate source to the drawer", () => {
    const { game, usernames } = createPlayingGame();
    const state = createSocketState();
    state.socketIdToUsername = usernames;
    game.pendingCard = {
      kind: "relocate",
      category: "good",
      drawerSocketId: "drawer",
      awaiting: "pickRelocateDst",
      srcCupIndex: 7,
    };

    const drawerPayload = buildCupGamePayload(state, game, "drawer");
    const opponentPayload = buildCupGamePayload(state, game, "opponent");

    assert.equal(drawerPayload.session.pendingCard.srcCupIndex, 7);
    assert.equal(
      Object.hasOwn(opponentPayload.session.pendingCard, "srcCupIndex"),
      false,
    );
    assert.equal(
      game.pendingCard.srcCupIndex,
      7,
      "sanitization must not mutate state",
    );
  });

  it("keeps peek coordinates and result private to the drawer", () => {
    const { game, usernames } = createPlayingGame();
    const state = createSocketState();
    state.socketIdToUsername = usernames;
    game.lastEvent = {
      kind: "peek",
      drawerSocketId: "drawer",
      cupIndex: 4,
      revealedAs: "spider",
    };

    const drawerEvent = buildCupGamePayload(state, game, "drawer").session
      .lastEvent;
    const opponentEvent = buildCupGamePayload(state, game, "opponent").session
      .lastEvent;

    assert.deepEqual(drawerEvent, game.lastEvent);
    assert.deepEqual(opponentEvent, {
      kind: "peek",
      drawerSocketId: "drawer",
    });
  });

  it("keeps relocate coordinates private after the move completes", () => {
    const { game, usernames } = createPlayingGame();
    const state = createSocketState();
    state.socketIdToUsername = usernames;
    game.lastEvent = {
      kind: "relocate",
      ownerSocketId: "drawer",
      fromCupIndex: 2,
      toCupIndex: 9,
    };

    const drawerEvent = buildCupGamePayload(state, game, "drawer").session
      .lastEvent;
    const opponentEvent = buildCupGamePayload(state, game, "opponent").session
      .lastEvent;

    assert.deepEqual(drawerEvent, game.lastEvent);
    assert.deepEqual(opponentEvent, {
      kind: "relocate",
      ownerSocketId: "drawer",
    });
  });
});
