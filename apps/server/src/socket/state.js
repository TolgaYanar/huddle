const CHAT_HISTORY_LIMIT = 50;
const ACTIVITY_HISTORY_LIMIT = 100;

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

    // Wheel
    roomWheel: new Map(),

    // Playlists
    roomPlaylistActive: new Map(),

    // Chat fallback
    roomChatHistory: new Map(),

    CHAT_HISTORY_LIMIT,
    ACTIVITY_HISTORY_LIMIT,
  };
}

module.exports = {
  createSocketState,
  CHAT_HISTORY_LIMIT,
  ACTIVITY_HISTORY_LIMIT,
};
