const { createSocketRateLimiter } = require("./socketRateLimit");

// Per-socket budgets for events whose handlers never had their own limiter.
// Each one broadcasts full room state (games carry up to ~6 MB of clue images,
// playlists every item of every playlist) or runs a DB query, so a single
// member looping on them multiplied egress and CPU across the whole room.
//
// Sized for real use, not typical use:
// - playlist writes: the "add videos" modal imports up to 500 items at one
//   emit per 100 ms (10/s), so the window must admit more than that.
// - room reads fire once each on every join/reconnect.
// Events with their own limiter (join_room, send_chat, sync_video, WebRTC,
// game_create, cup_game_create, game_add_rounds, ...) are deliberately absent.
const EVENT_BUDGETS = [
  {
    name: "playlist-write",
    windowMs: 10_000,
    max: 120,
    events: [
      "playlist_create",
      "playlist_update",
      "playlist_delete",
      "playlist_set_active",
      "playlist_add_item",
      "playlist_remove_item",
      "playlist_reorder_items",
      "playlist_play_item",
      "playlist_next",
      "playlist_previous",
    ],
  },
  {
    name: "room-read",
    windowMs: 10_000,
    max: 60,
    events: [
      "playlist_get",
      "request_chat_history",
      "request_activity_history",
      "game_get",
      "cup_game_get",
      "wheel_get",
      "timer_get",
    ],
  },
  {
    name: "game-action",
    windowMs: 10_000,
    max: 60,
    events: [
      "game_remove_rounds",
      "session_start",
      "game_guess",
      "game_hint",
      "game_skip_turn",
      "game_end_round",
      "game_next_round",
      "session_end",
      "game_set_observer",
      "game_reset",
      "cup_game_update_config",
      "cup_game_start_placement",
      "cup_game_toggle_spider",
      "cup_game_lock_placement",
      "cup_game_unlock_placement",
      "cup_game_flip",
      "cup_game_draw",
      "cup_game_resolve_card",
      "cup_game_cancel_card",
      "cup_game_reset",
    ],
  },
  {
    name: "wheel",
    windowMs: 10_000,
    max: 40,
    events: [
      "wheel_add_entry",
      "wheel_remove_entry",
      "wheel_clear",
      "wheel_spin",
    ],
  },
  {
    name: "timer",
    windowMs: 10_000,
    max: 30,
    events: ["timer_set_duration", "timer_start", "timer_pause", "timer_reset"],
  },
];

// Returns (eventName) => boolean. Events outside every budget always pass.
function createEventBudget(budgets = EVENT_BUDGETS) {
  const byEvent = new Map();
  for (const budget of budgets) {
    const limiter = createSocketRateLimiter(budget);
    for (const event of budget.events) byEvent.set(event, limiter);
  }
  return function allow(event) {
    const limiter = byEvent.get(event);
    return limiter ? limiter() : true;
  };
}

// Drops over-budget packets before any handler sees them. None of these
// events use acknowledgements, so a dropped packet leaves no caller waiting.
function attachEventBudget(socket, budgets = EVENT_BUDGETS) {
  const allow = createEventBudget(budgets);
  socket.use((packet, next) => {
    if (allow(packet[0])) next();
  });
}

module.exports = { EVENT_BUDGETS, createEventBudget, attachEventBudget };
