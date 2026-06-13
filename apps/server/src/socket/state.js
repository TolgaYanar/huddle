const { cancelCupTurnTimer } = require("./helpers/cupGame");
const { cancelTurnTimer } = require("./helpers/gameTimer");

const CHAT_HISTORY_LIMIT = 50;
const ACTIVITY_HISTORY_LIMIT = 100;

// How long an emptied room keeps its in-memory state before we free it. Long
// enough to ride out a reconnect blip / page refresh; short enough that a
// genuinely abandoned room doesn't pin memory. A reconnect within this window
// cancels the pending cleanup (see joinRoom.js).
const ROOM_EMPTY_GRACE_MS = 2 * 60 * 1000;

function createSocketState() {
  return {
    socketIdToUsername: new Map(),

    // Room state
    roomState: new Map(),
    roomMediaState: new Map(),

    // Moderation
    roomHost: new Map(),
    roomBans: new Map(),
    roomPasswordHash: new Map(),
    roomName: new Map(),

    // Wheel
    roomWheel: new Map(),

    // Games: Map<roomId, Map<gameId, game>>
    roomGames: new Map(),

    // Cup Spider games: Map<roomId, Map<gameId, cupGame>>
    roomCupGames: new Map(),

    // Per-cup-game turn timer handles: Map<gameId, Timeout>
    cupGameTurnTimers: new Map(),

    // Playlists
    roomPlaylistActive: new Map(),

    // Timers
    roomTimer: new Map(),

    // Chat fallback
    roomChatHistory: new Map(),

    // Reactions: Map<roomId, Map<messageId, Record<emoji, Set<socketId>>>>
    roomReactions: new Map(),

    // Grace-period room cleanup handles: Map<roomId, Timeout>
    roomCleanupTimers: new Map(),

    CHAT_HISTORY_LIMIT,
    ACTIVITY_HISTORY_LIMIT,
  };
}

/**
 * Stable per-room ban identity for a socket. Authenticated users get a
 * `user:<id>` identity that survives reconnects (their socket.id changes on
 * every reconnect, so banning the raw socket.id let a kicked user rejoin
 * instantly). Guests fall back to `socket:<id>` — a best-effort ban that the
 * guest defeats simply by reconnecting (new socket.id). We deliberately do NOT
 * ban by IP (proxy/NAT collateral). roomBans stays in-memory and is freed when
 * the room is cleaned up.
 */
function getBanIdentity(socket) {
  const authId = socket?.data?.authUser?.id;
  if (authId) return `user:${authId}`;
  return `socket:${socket?.id}`;
}

// Per-room maps that hold all the ephemeral state for one room. cleanupRoom
// frees every one of these for an emptied room. Kept here (rather than inline)
// so the set is reviewed in one place if new per-room maps are added.
const PER_ROOM_MAPS = [
  "roomState",
  "roomName",
  "roomMediaState",
  "roomHost",
  "roomBans",
  "roomPasswordHash",
  "roomWheel",
  "roomGames",
  "roomCupGames",
  "roomPlaylistActive",
  "roomTimer",
  "roomChatHistory",
  "roomReactions",
];

function cancelRoomCleanup(state, roomId) {
  const handle = state.roomCleanupTimers.get(roomId);
  if (handle) {
    clearTimeout(handle);
    state.roomCleanupTimers.delete(roomId);
  }
}

// Clear any per-game turn timers tied to this room's games before we drop the
// game maps. Both regular (gameTurnTimers) and cup-spider (cupGameTurnTimers)
// timer handles are keyed by gameId, so we walk this room's games to find them.
function clearRoomGameTimers(state, roomId) {
  const games = state.roomGames.get(roomId);
  if (games) {
    for (const game of games.values()) {
      if (game && game.id) cancelTurnTimer(state, game.id);
    }
  }
  const cupGames = state.roomCupGames.get(roomId);
  if (cupGames) {
    for (const game of cupGames.values()) {
      if (game && game.id) cancelCupTurnTimer(state, game.id);
    }
  }
}

function cleanupRoom(io, state, roomId) {
  // Re-verify the room is still empty: a socket may have (re)joined between the
  // timer being scheduled and it firing. If so, abandon the cleanup and just
  // drop the timer entry — the rejoiner's state must survive.
  const room = io?.sockets?.adapter?.rooms?.get(roomId);
  if (room && room.size > 0) {
    state.roomCleanupTimers.delete(roomId);
    return;
  }

  clearRoomGameTimers(state, roomId);
  for (const mapName of PER_ROOM_MAPS) {
    state[mapName]?.delete(roomId);
  }
  state.roomCleanupTimers.delete(roomId);
}

function scheduleRoomCleanup(io, state, roomId) {
  // Avoid stacking duplicate timers for the same room.
  cancelRoomCleanup(state, roomId);
  const handle = setTimeout(() => {
    cleanupRoom(io, state, roomId);
  }, ROOM_EMPTY_GRACE_MS);
  // Never let a pending cleanup keep the process alive.
  if (typeof handle.unref === "function") handle.unref();
  state.roomCleanupTimers.set(roomId, handle);
}

module.exports = {
  createSocketState,
  getBanIdentity,
  cancelRoomCleanup,
  cleanupRoom,
  scheduleRoomCleanup,
  ROOM_EMPTY_GRACE_MS,
  CHAT_HISTORY_LIMIT,
  ACTIVITY_HISTORY_LIMIT,
};
