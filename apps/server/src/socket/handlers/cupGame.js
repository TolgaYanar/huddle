const {
  newGame,
  getOrCreateRoomCupGames,
  getPlayer,
  ensurePlayer,
  buildTurnOrder,
  getCurrentTurnSocketId,
  advanceTurn,
  pushEvent,
  drawCard,
  flipCupLowLevel,
  checkEndConditions,
  clearPendingCardIfDone,
  emitCupGameStateTo,
  emitCupGameStateToRoom,
  scheduleCupTurnTimer,
  cancelCupTurnTimer,
  pickGridForPlayers,
  clampLives,
} = require("../helpers/cupGame");
const { parseTurnTimer } = require("../helpers/gameTimer");

function isHost(state, roomId, socketId) {
  return state.roomHost.get(roomId) === socketId;
}

function attachCupGameHandlers(io, state, socket) {
  // ── Get state ──────────────────────────────────────────────────────────────
  socket.on("cup_game_get", (data) => {
    const { roomId } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;
    emitCupGameStateTo(state, socket, roomId);
  });

  // ── Create lobby ──────────────────────────────────────────────────────────
  socket.on("cup_game_create", (data) => {
    const { roomId, startingLives, gridSize, turnTimerSeconds } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;

    const room = io.sockets.adapter.rooms.get(roomId);
    const roomSocketIds = room ? [...room] : [socket.id];
    const usernamesById = state.socketIdToUsername;
    const username = usernamesById.get(socket.id) || null;

    const game = newGame({
      creatorSocketId: socket.id,
      creatorUsername: username,
      startingLives,
      gridSize,
      turnTimerSeconds,
      roomSocketIds,
      usernamesById,
    });
    getOrCreateRoomCupGames(state, roomId).set(game.id, game);
    emitCupGameStateToRoom(io, state, roomId);
  });

  // ── Update config (creator/host only, lobby only) ────────────────────────
  socket.on("cup_game_update_config", (data) => {
    const { roomId, gameId, startingLives, gridSize, turnTimerSeconds } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;

    const games = state.roomCupGames.get(roomId);
    if (!games) return;
    const game = games.get(gameId);
    if (!game || game.status !== "lobby") return;
    if (socket.id !== game.creatorSocketId && !isHost(state, roomId, socket.id)) return;

    if (startingLives !== null && startingLives !== undefined) {
      const lives = clampLives(startingLives, game.config.startingLives);
      game.config.startingLives = lives;
      // Update each player's budget + current lives in lobby.
      for (const p of game.players) {
        p.lives = lives;
        p.spiderBudget = lives;
      }
    }
    if (gridSize === "compact" || gridSize === "standard" || gridSize === "large") {
      const playerCount = game.players.filter((p) => !p.isSpectator).length || 2;
      const grid = pickGridForPlayers(playerCount, gridSize);
      game.config.rows = grid.rows;
      game.config.cols = grid.cols;
      game.cups = new Array(grid.rows * grid.cols).fill(null).map((_, i) => ({
        index: i,
        status: "hidden",
        revealedAs: undefined,
        ownerSocketId: undefined,
      }));
    }
    if (turnTimerSeconds !== undefined) {
      game.config.turnTimerSeconds = parseTurnTimer(turnTimerSeconds);
    }

    emitCupGameStateToRoom(io, state, roomId);
  });

  // ── Start placement (creator only, lobby → placing) ──────────────────────
  socket.on("cup_game_start_placement", (data) => {
    const { roomId, gameId } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;

    const games = state.roomCupGames.get(roomId);
    if (!games) return;
    const game = games.get(gameId);
    if (!game || game.status !== "lobby") return;
    if (socket.id !== game.creatorSocketId && !isHost(state, roomId, socket.id)) return;
    if (game.players.filter((p) => !p.isSpectator).length < 2) return;

    // Snap grid to current player count's recommended size if it's still at
    // the default-from-create — keeps the game playable when more people
    // joined the lobby after creation.
    const playerCount = game.players.filter((p) => !p.isSpectator).length;
    const grid = pickGridForPlayers(playerCount, "standard");
    if (game.config.rows * game.config.cols < playerCount * game.config.startingLives * 2) {
      game.config.rows = grid.rows;
      game.config.cols = grid.cols;
      game.cups = new Array(grid.rows * grid.cols).fill(null).map((_, i) => ({
        index: i,
        status: "hidden",
        revealedAs: undefined,
        ownerSocketId: undefined,
      }));
    }

    game.status = "placing";
    emitCupGameStateToRoom(io, state, roomId);
  });

  // ── Toggle a spider on/off during placement ──────────────────────────────
  socket.on("cup_game_toggle_spider", (data) => {
    const { roomId, gameId, cupIndex } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;

    const games = state.roomCupGames.get(roomId);
    if (!games) return;
    const game = games.get(gameId);
    if (!game || game.status !== "placing") return;

    const p = getPlayer(game, socket.id);
    if (!p || p.isSpectator || p.isPlacementLocked) return;

    const idx = Number(cupIndex);
    if (!Number.isInteger(idx) || idx < 0 || idx >= game.cups.length) return;

    if (p.mySpiderCups.has(idx)) {
      // Toggle off your own placement.
      p.mySpiderCups.delete(idx);
      game.spiderOwnerByCup.delete(idx);
      p.spidersPlaced = p.mySpiderCups.size;
    } else {
      if (p.mySpiderCups.size >= p.spiderBudget) return;
      if (game.spiderOwnerByCup.has(idx)) {
        // Collision with another player's spider. We deliberately do NOT
        // reject here — rejecting would leak the location of the other
        // player's spider to whoever clicked. The new placer's click ALWAYS
        // succeeds at the target cup; the existing spider is silently
        // relocated to a random empty cup. The new placer can't tell their
        // click bumped anyone (their spider visibly lands where they clicked),
        // and the original owner only knows "my own marker moved" — not who
        // bumped them or what cup the colliding player wanted.
        const otherOwnerSocketId = game.spiderOwnerByCup.get(idx);
        const otherPlayer = getPlayer(game, otherOwnerSocketId);
        const empties = [];
        for (let i = 0; i < game.cups.length; i++) {
          if (game.cups[i].status === "hidden" && !game.spiderOwnerByCup.has(i) && i !== idx) {
            empties.push(i);
          }
        }
        if (empties.length === 0) {
          // No empty cup to relocate the existing spider to. Silently no-op
          // rather than reveal anything.
          return;
        }
        const relocatedTo = empties[Math.floor(Math.random() * empties.length)];
        if (otherPlayer) {
          otherPlayer.mySpiderCups.delete(idx);
          otherPlayer.mySpiderCups.add(relocatedTo);
          otherPlayer.spidersPlaced = otherPlayer.mySpiderCups.size;
        }
        game.spiderOwnerByCup.delete(idx);
        game.spiderOwnerByCup.set(idx, socket.id);
        game.spiderOwnerByCup.set(relocatedTo, otherOwnerSocketId);
        p.mySpiderCups.add(idx);
        p.spidersPlaced = p.mySpiderCups.size;
      } else {
        p.mySpiderCups.add(idx);
        game.spiderOwnerByCup.set(idx, socket.id);
        p.spidersPlaced = p.mySpiderCups.size;
      }
    }

    emitCupGameStateToRoom(io, state, roomId);
  });

  // ── Lock placement → start play once everyone is ready ───────────────────
  socket.on("cup_game_lock_placement", (data) => {
    const { roomId, gameId } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;

    const games = state.roomCupGames.get(roomId);
    if (!games) return;
    const game = games.get(gameId);
    if (!game || game.status !== "placing") return;

    const p = getPlayer(game, socket.id);
    if (!p || p.isSpectator) return;
    p.isPlacementLocked = true;

    // Once every non-spectator player has locked, transition to playing.
    const eligible = game.players.filter((x) => !x.isSpectator);
    if (eligible.length >= 2 && eligible.every((x) => x.isPlacementLocked)) {
      game.status = "playing";
      game.startedAt = Date.now();
      game.turnOrder = buildTurnOrder(game);
      game.currentTurnIdx = 0;
      scheduleCupTurnTimer(io, state, roomId, game.id);
    }

    emitCupGameStateToRoom(io, state, roomId);
  });

  // ── Unlock (player changes mind during placement) ────────────────────────
  socket.on("cup_game_unlock_placement", (data) => {
    const { roomId, gameId } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;

    const games = state.roomCupGames.get(roomId);
    if (!games) return;
    const game = games.get(gameId);
    if (!game || game.status !== "placing") return;
    const p = getPlayer(game, socket.id);
    if (!p) return;
    p.isPlacementLocked = false;
    emitCupGameStateToRoom(io, state, roomId);
  });

  // ── Flip a cup ───────────────────────────────────────────────────────────
  socket.on("cup_game_flip", (data) => {
    const { roomId, gameId, cupIndex } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;

    const games = state.roomCupGames.get(roomId);
    if (!games) return;
    const game = games.get(gameId);
    if (!game || game.status !== "playing") return;

    const idx = Number(cupIndex);
    if (!Number.isInteger(idx) || idx < 0 || idx >= game.cups.length) return;

    // Two valid origins for a flip:
    //   1. The current player's normal turn-action.
    //   2. They're holding a pendingCard awaiting "pickCup" (chained flip
    //      from flipPlusOne / flipPlusTwo / peek).
    if (game.pendingCard) {
      // Only the drawer can resolve their pending card via this event, and
      // only when awaiting a cup pick. Other awaiting kinds go through
      // cup_game_resolve_card with the appropriate fields.
      if (game.pendingCard.drawerSocketId !== socket.id) return;
      const a = game.pendingCard.awaiting;
      if (a !== "pickCup") return;
      // Peek doesn't actually flip: it reveals the cup privately to drawer.
      if (game.pendingCard.kind === "peek") {
        const cup = game.cups[idx];
        if (!cup || cup.status !== "hidden") return;
        const owner = game.spiderOwnerByCup.get(idx) || null;
        const revealed = owner ? "spider" : "empty";
        // Tell only the drawer what they saw.
        socket.emit("cup_game_peek_result", {
          roomId,
          gameId,
          cupIndex: idx,
          revealedAs: revealed,
          ownerSocketId: owner || null,
        });
        pushEvent(game, { kind: "peek", drawerSocketId: socket.id, cupIndex: idx, revealedAs: revealed });
        game.pendingCard = null;
        advanceTurn(game);
        scheduleCupTurnTimer(io, state, roomId, game.id);
        emitCupGameStateToRoom(io, state, roomId);
        return;
      }
      // Forced flip from flipPlusOne / flipPlusTwo: drawer is flipper.
      const result = flipCupLowLevel(game, idx, socket.id);
      if (!result) return;
      const remaining = (game.pendingCard.remainingFlips || 1) - 1;
      if (remaining > 0) {
        game.pendingCard.remainingFlips = remaining;
      } else {
        game.pendingCard = null;
        advanceTurn(game);
      }
      checkEndConditions(game);
      clearPendingCardIfDone(game);
      scheduleCupTurnTimer(io, state, roomId, game.id);
      emitCupGameStateToRoom(io, state, roomId);
      return;
    }

    // Normal turn flip.
    if (getCurrentTurnSocketId(game) !== socket.id) return;
    const result = flipCupLowLevel(game, idx, socket.id);
    if (!result) return;
    advanceTurn(game);
    checkEndConditions(game);
    scheduleCupTurnTimer(io, state, roomId, game.id);
    emitCupGameStateToRoom(io, state, roomId);
  });

  // ── Draw a card ──────────────────────────────────────────────────────────
  socket.on("cup_game_draw", (data) => {
    const { roomId, gameId } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;

    const games = state.roomCupGames.get(roomId);
    if (!games) return;
    const game = games.get(gameId);
    if (!game || game.status !== "playing") return;
    if (game.pendingCard) return;
    if (getCurrentTurnSocketId(game) !== socket.id) return;

    const card = drawCard(game);
    pushEvent(game, { kind: "draw", drawerSocketId: socket.id, cardKind: card.kind, category: card.category });

    const drawer = getPlayer(game, socket.id);

    switch (card.kind) {
      case "mirror": {
        if (drawer) drawer.hasMirror = true;
        pushEvent(game, { kind: "mirror", drawerSocketId: socket.id });
        advanceTurn(game);
        scheduleCupTurnTimer(io, state, roomId, game.id);
        emitCupGameStateToRoom(io, state, roomId);
        return;
      }
      case "skipYourTurn": {
        // The drawer's *next* turn skips. Their current turn is consumed by
        // the draw itself, so just advance.
        if (drawer) drawer.skipNextTurn = true;
        pushEvent(game, { kind: "skip", targetSocketId: socket.id, reason: "skipYourTurn" });
        advanceTurn(game);
        scheduleCupTurnTimer(io, state, roomId, game.id);
        emitCupGameStateToRoom(io, state, roomId);
        return;
      }
      case "flipPlusOne": {
        game.pendingCard = {
          kind: card.kind,
          category: card.category,
          drawerSocketId: socket.id,
          awaiting: "pickCup",
          remainingFlips: 1,
        };
        emitCupGameStateToRoom(io, state, roomId);
        return;
      }
      case "flipPlusTwo": {
        game.pendingCard = {
          kind: card.kind,
          category: card.category,
          drawerSocketId: socket.id,
          awaiting: "pickCup",
          remainingFlips: 2,
        };
        emitCupGameStateToRoom(io, state, roomId);
        return;
      }
      case "flipRow": {
        game.pendingCard = {
          kind: card.kind,
          category: card.category,
          drawerSocketId: socket.id,
          awaiting: "pickRow",
        };
        emitCupGameStateToRoom(io, state, roomId);
        return;
      }
      case "flipBlock": {
        game.pendingCard = {
          kind: card.kind,
          category: card.category,
          drawerSocketId: socket.id,
          awaiting: "pickBlock",
        };
        emitCupGameStateToRoom(io, state, roomId);
        return;
      }
      case "stealTurn": {
        game.pendingCard = {
          kind: card.kind,
          category: card.category,
          drawerSocketId: socket.id,
          awaiting: "pickTarget",
        };
        emitCupGameStateToRoom(io, state, roomId);
        return;
      }
      case "forceFlip": {
        game.pendingCard = {
          kind: card.kind,
          category: card.category,
          drawerSocketId: socket.id,
          awaiting: "pickTarget",
        };
        emitCupGameStateToRoom(io, state, roomId);
        return;
      }
      case "peek": {
        game.pendingCard = {
          kind: card.kind,
          category: card.category,
          drawerSocketId: socket.id,
          awaiting: "pickCup",
        };
        emitCupGameStateToRoom(io, state, roomId);
        return;
      }
      case "relocate": {
        if (!drawer || drawer.mySpiderCups.size === 0) {
          // No spiders to relocate — gracefully end the turn.
          advanceTurn(game);
          scheduleCupTurnTimer(io, state, roomId, game.id);
          emitCupGameStateToRoom(io, state, roomId);
          return;
        }
        game.pendingCard = {
          kind: card.kind,
          category: card.category,
          drawerSocketId: socket.id,
          awaiting: "pickRelocateSrc",
        };
        emitCupGameStateToRoom(io, state, roomId);
        return;
      }
      default:
        return;
    }
  });

  // ── Resolve a pending card with extra input ──────────────────────────────
  socket.on("cup_game_resolve_card", (data) => {
    const { roomId, gameId } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;

    const games = state.roomCupGames.get(roomId);
    if (!games) return;
    const game = games.get(gameId);
    if (!game || game.status !== "playing" || !game.pendingCard) return;

    const card = game.pendingCard;
    if (card.drawerSocketId !== socket.id) return;

    switch (card.awaiting) {
      case "pickRow": {
        const rowIndex = Number(data.rowIndex);
        if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= game.config.rows) return;
        const start = rowIndex * game.config.cols;
        for (let i = 0; i < game.config.cols; i++) {
          const cup = game.cups[start + i];
          if (cup && cup.status === "hidden") {
            flipCupLowLevel(game, start + i, socket.id);
            // Stop early if this hit eliminated the drawer.
            const drawer = getPlayer(game, socket.id);
            if (drawer && drawer.eliminated) break;
          }
        }
        game.pendingCard = null;
        advanceTurn(game);
        checkEndConditions(game);
        scheduleCupTurnTimer(io, state, roomId, game.id);
        emitCupGameStateToRoom(io, state, roomId);
        return;
      }
      case "pickBlock": {
        const topLeft = Number(data.blockTopLeftCupIndex);
        if (!Number.isInteger(topLeft) || topLeft < 0 || topLeft >= game.cups.length) return;
        const row = Math.floor(topLeft / game.config.cols);
        const col = topLeft % game.config.cols;
        if (row + 1 >= game.config.rows || col + 1 >= game.config.cols) return;
        const offsets = [
          topLeft,
          topLeft + 1,
          topLeft + game.config.cols,
          topLeft + game.config.cols + 1,
        ];
        for (const i of offsets) {
          const cup = game.cups[i];
          if (cup && cup.status === "hidden") {
            flipCupLowLevel(game, i, socket.id);
            const drawer = getPlayer(game, socket.id);
            if (drawer && drawer.eliminated) break;
          }
        }
        game.pendingCard = null;
        advanceTurn(game);
        checkEndConditions(game);
        scheduleCupTurnTimer(io, state, roomId, game.id);
        emitCupGameStateToRoom(io, state, roomId);
        return;
      }
      case "pickTarget": {
        const targetSocketId = String(data.targetSocketId || "");
        const target = getPlayer(game, targetSocketId);
        if (!target || target.eliminated || target.isSpectator) return;
        if (target.socketId === socket.id) return; // can't target self
        if (card.kind === "stealTurn") {
          target.skipNextTurn = true;
          pushEvent(game, { kind: "skip", targetSocketId, reason: "stealTurn" });
          game.pendingCard = null;
          advanceTurn(game);
          scheduleCupTurnTimer(io, state, roomId, game.id);
          emitCupGameStateToRoom(io, state, roomId);
          return;
        }
        if (card.kind === "forceFlip") {
          card.targetSocketId = targetSocketId;
          card.awaiting = "pickTargetCup";
          emitCupGameStateToRoom(io, state, roomId);
          return;
        }
        return;
      }
      case "pickTargetCup": {
        if (card.kind !== "forceFlip" || !card.targetSocketId) return;
        const idx = Number(data.cupIndex);
        if (!Number.isInteger(idx) || idx < 0 || idx >= game.cups.length) return;
        const cup = game.cups[idx];
        if (!cup || cup.status !== "hidden") return;
        // Target is the flipper — they take any spider hit.
        flipCupLowLevel(game, idx, card.targetSocketId);
        game.pendingCard = null;
        advanceTurn(game);
        checkEndConditions(game);
        scheduleCupTurnTimer(io, state, roomId, game.id);
        emitCupGameStateToRoom(io, state, roomId);
        return;
      }
      case "pickRelocateSrc": {
        const idx = Number(data.fromCupIndex);
        const drawer = getPlayer(game, socket.id);
        if (!drawer) return;
        if (!drawer.mySpiderCups.has(idx)) return;
        card.srcCupIndex = idx;
        card.awaiting = "pickRelocateDst";
        emitCupGameStateToRoom(io, state, roomId);
        return;
      }
      case "pickRelocateDst": {
        const dst = Number(data.toCupIndex);
        const src = card.srcCupIndex;
        if (typeof src !== "number") return;
        if (!Number.isInteger(dst) || dst < 0 || dst >= game.cups.length) return;
        if (dst === src) return;
        const dstCup = game.cups[dst];
        if (!dstCup || dstCup.status !== "hidden") return;
        if (game.spiderOwnerByCup.has(dst)) return;
        const drawer = getPlayer(game, socket.id);
        if (!drawer || !drawer.mySpiderCups.has(src)) return;
        drawer.mySpiderCups.delete(src);
        game.spiderOwnerByCup.delete(src);
        drawer.mySpiderCups.add(dst);
        game.spiderOwnerByCup.set(dst, socket.id);
        pushEvent(game, { kind: "relocate", ownerSocketId: socket.id, fromCupIndex: src, toCupIndex: dst });
        game.pendingCard = null;
        advanceTurn(game);
        scheduleCupTurnTimer(io, state, roomId, game.id);
        emitCupGameStateToRoom(io, state, roomId);
        return;
      }
      default:
        return;
    }
  });

  // ── Cancel an in-flight card (drawer only — relocate fallback) ───────────
  socket.on("cup_game_cancel_card", (data) => {
    const { roomId, gameId } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;
    const games = state.roomCupGames.get(roomId);
    if (!games) return;
    const game = games.get(gameId);
    if (!game || !game.pendingCard) return;
    if (game.pendingCard.drawerSocketId !== socket.id) return;
    // Only safe to cancel when no flips have happened yet (no remainingFlips
    // already burned). For simplicity we allow cancel on any awaiting state
    // that hasn't yet flipped a cup.
    const cancelable = ["pickTarget", "pickTargetCup", "pickRelocateSrc", "pickRelocateDst", "pickRow", "pickBlock"];
    if (!cancelable.includes(game.pendingCard.awaiting)) return;
    game.pendingCard = null;
    advanceTurn(game);
    scheduleCupTurnTimer(io, state, roomId, game.id);
    emitCupGameStateToRoom(io, state, roomId);
  });

  // ── Reset / delete game ──────────────────────────────────────────────────
  socket.on("cup_game_reset", (data) => {
    const { roomId, gameId } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;
    const games = state.roomCupGames.get(roomId);
    if (!games) return;
    const game = games.get(gameId);
    if (!game) return;
    if (
      game.status === "playing" &&
      socket.id !== game.creatorSocketId &&
      !isHost(state, roomId, socket.id)
    ) return;
    cancelCupTurnTimer(state, gameId);
    games.delete(gameId);
    emitCupGameStateToRoom(io, state, roomId);
  });
}

module.exports = { attachCupGameHandlers };
