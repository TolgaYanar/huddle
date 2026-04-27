// Define types for our sync events
export type SyncAction =
  | "play"
  | "pause"
  | "seek"
  | "change_url"
  | "set_mute"
  | "set_speed"
  | "set_volume"
  | "set_audio_sync";

export interface SyncData {
  roomId: string;
  action: SyncAction;
  timestamp: number;
  videoUrl?: string;
  updatedAt?: number;
  // Server epoch millis at time of emission; used to estimate client/server clock offset.
  serverNow?: number;
  // Monotonic room revision assigned by the server.
  // Allows clients to ignore stale events and detect gaps.
  rev?: number;
  volume?: number;
  isMuted?: boolean;
  playbackSpeed?: number;
  audioSyncEnabled?: boolean;
  senderId?: string;
  senderUsername?: string | null;
}

export interface RoomStateData {
  roomId: string;
  videoUrl?: string;
  timestamp?: number;
  action?: SyncAction;
  isPlaying?: boolean;
  volume?: number;
  isMuted?: boolean;
  playbackSpeed?: number;
  audioSyncEnabled?: boolean;
  updatedAt?: number;
  serverNow?: number;
  rev?: number;
  senderId?: string;
  senderUsername?: string | null;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderUsername?: string | null;
  text: string;
  createdAt: string | Date;
}

export interface ChatHistoryData {
  roomId: string;
  messages: ChatMessage[];
}

export type ActivityKind = "sync" | "join" | "leave";

export interface ActivityEvent {
  id: string;
  roomId: string;
  kind: ActivityKind | string;
  action?: SyncAction | string | null;
  timestamp?: number | null;
  videoUrl?: string | null;
  senderId?: string | null;
  senderUsername?: string | null;
  createdAt: string | Date;
}

export interface ActivityHistoryData {
  roomId: string;
  events: ActivityEvent[];
}

export interface WebRTCMediaState {
  mic: boolean;
  cam: boolean;
  screen: boolean;
}

export interface RoomUsersData {
  roomId: string;
  users: string[];
  // Optional map of socketId -> username (if available)
  usernames?: Record<string, string | null>;
  mediaStates?: Record<string, WebRTCMediaState>;
  hostId?: string | null;
}

export interface RoomPasswordStatusData {
  roomId: string;
  hasPassword: boolean;
}

export interface RoomPasswordRequiredData {
  roomId: string;
  reason?: "required" | "invalid";
}

export type UserPresenceData =
  | string
  | {
      socketId: string;
      username?: string | null;
    };

export interface WheelSpinData {
  index: number;
  result: string;
  entryCount: number;
  spunAt: number;
  senderId?: string;
}

export interface WheelStateData {
  roomId: string;
  entries: string[];
  lastSpin?: WheelSpinData | null;
}

export interface WheelSpunData {
  roomId: string;
  index: number;
  result: string;
  entryCount: number;
  spunAt: number;
  senderId?: string;
  entries?: string[];
}

// Playlist types
export interface PlaylistItem {
  id: string;
  videoUrl: string;
  title: string;
  addedBy: string;
  addedByUsername?: string | null;
  addedAt: number;
  duration?: number;
  thumbnail?: string;
}

export interface Playlist {
  id: string;
  roomId: string;
  name: string;
  description?: string;
  items: PlaylistItem[];
  createdBy: string;
  createdByUsername?: string | null;
  createdAt: number;
  updatedAt: number;
  isDefault?: boolean;
  settings: PlaylistSettings;
}

export interface PlaylistSettings {
  loop: boolean;
  shuffle: boolean;
  autoPlay: boolean;
}

export interface PlaylistStateData {
  roomId: string;
  playlists: Playlist[];
  activePlaylistId?: string | null;
  currentItemIndex?: number;
}

/** Options the creator can pass when starting a new game. */
export interface CreateGameOptions {
  /**
   * Seconds before the current guesser auto-skips. `null` (or omitted) means
   * "no timer". The server clamps to a sensible range.
   */
  turnTimerSeconds?: number | null;
}

// Game types
export interface GameRoundInput {
  category: string;
  answer: string;
  image: string;
  hideBlanks: boolean;
}

export interface GameGuess {
  socketId: string;
  username: string | null;
  guess: string;
  correct: boolean;
  /**
   * True when the guess is wrong but very close to the answer (within a small
   * Levenshtein distance, scaled to answer length). Lets the UI show a
   * "so close!" indicator instead of just plain wrong.
   */
  nearMiss?: boolean;
  turnNumber: number;
}

export interface GameWinner {
  socketId: string;
  username: string | null;
  /**
   * Points awarded for this win. Baked in at the moment of correct guess
   * (decreases as the questioner reveals more hints), so faster guessers
   * earn more.
   */
  points?: number;
}

export interface GameRound {
  category: string;
  answer?: string; // only visible to current questioner or when round is finished
  answerMasked?: string[]; // absent when hideBlanks is on and no hints revealed
  hideBlanks: boolean;
  image: string;
  guesses: GameGuess[];
  winners: string[];
  winnerUsernames: GameWinner[];
  hintsRevealed: number;
  status: "active" | "finished";
}

export interface GameScoreEntry {
  username: string | null;
  /** Number of rounds the player won (one per correct guess). */
  wins: number;
  /**
   * Total points: sum of per-win `GameWinner.points` (lower for hint-revealed
   * answers). Use this for ranking.
   */
  score: number;
}

export interface GameQuestioner {
  socketId: string;
  username: string | null;
  totalRounds: number;
  currentRoundIndex: number;
  currentRound: GameRound | null;
  isDone: boolean;
  isActive: boolean;
}

export interface GameSession {
  currentQuestionerIdx: number;
  currentQuestionerId: string | null;
  currentQuestionerName: string | null;
  currentGuesserSocketId: string | null;
  participants: string[];
  participantUsernames: Record<string, string | null>;
  /** Socket ids that have opted out of being a guesser ("watch only"). */
  observers: string[];
  /**
   * Configured turn timer in seconds. `null` means "no timer". Set at game
   * creation and unchanged thereafter.
   */
  turnTimerSeconds: number | null;
  /**
   * Absolute server-time ms at which the current guesser's turn auto-skips.
   * `null` when no turn is in flight (staging, finished, between rounds).
   */
  turnDeadline: number | null;
  /** Server's clock at the moment this payload was built — for client-side offset estimation. */
  serverNow: number;
}

export interface GameData {
  gameId: string;
  creatorId: string;
  creatorName: string | null;
  status: "staging" | "active" | "finished";
  startedAt: number | null;
  questioners: GameQuestioner[];
  session: GameSession;
  scoreboard: Record<string, GameScoreEntry>;
}

export interface GameStateData {
  roomId: string;
  games: GameData[];
}

// ── Cup Spider game ──────────────────────────────────────────────────────────

export type CupGameStatus = "lobby" | "placing" | "playing" | "finished";

/**
 * The 5 good cards reward the drawer; the 5 bad cards punish them. The deck is
 * sampled uniformly random — no depletion, no luck balancing — so every draw
 * is the same coin flip even after a long streak.
 */
export type CupGameCardKind =
  // Bad: drawer takes consequences immediately
  | "flipPlusOne"
  | "flipPlusTwo"
  | "flipRow"
  | "flipBlock"
  | "skipYourTurn"
  // Good: drawer chooses target / cup / spider
  | "forceFlip"
  | "stealTurn"
  | "peek"
  | "relocate"
  | "shield";

export type CupGameCardCategory = "good" | "bad";

/**
 * When a card needs more input from the drawer (pick a cup, pick a target,
 * etc.), the server records `pendingCard` so the UI knows what selector to
 * show. Resolved via a single `cup_game_resolve_card` event whose payload
 * shape depends on `awaiting`.
 */
export type CupGameAwaiting =
  | "pickCup" // flipPlusOne / flipPlusTwo / peek
  | "pickRow" // flipRow
  | "pickBlock" // flipBlock — index of top-left cell of a 2×2 block
  | "pickTarget" // stealTurn / forceFlip step 1
  | "pickTargetCup" // forceFlip step 2 (cup the target will flip)
  | "pickRelocateSrc" // relocate step 1 (drawer picks one of their own spiders)
  | "pickRelocateDst"; // relocate step 2 (empty cup destination)

export interface CupGamePendingCard {
  kind: CupGameCardKind;
  category: CupGameCardCategory;
  drawerSocketId: string;
  awaiting: CupGameAwaiting;
  /** Forced flips remaining after the next pick (for flipPlusTwo). */
  remainingFlips?: number;
  /** Locked-in target after step 1 of forceFlip. */
  targetSocketId?: string;
  /** Locked-in source cup after step 1 of relocate. */
  srcCupIndex?: number;
}

export interface CupGameCup {
  index: number;
  status: "hidden" | "flipped";
  /** Only set once flipped. */
  revealedAs?: "empty" | "spider";
  /** Only set when revealedAs === "spider" and the cup is flipped. */
  ownerSocketId?: string;
  /**
   * Server only sends `mineSpider: true` to the owner of an unflipped spider
   * cup so they can remember their own placements without leaking others'.
   */
  mineSpider?: boolean;
}

export interface CupGamePlayer {
  socketId: string;
  username: string | null;
  lives: number;
  /** True when this player is out of lives. */
  eliminated: boolean;
  /** During placing: spiders the player has placed so far. */
  spidersPlaced: number;
  /** Max spiders this player is allowed to place (= startingLives at game start). */
  spiderBudget: number;
  /** True once the player has locked their placement and is ready to play. */
  isPlacementLocked: boolean;
  /** True when the player still has at least one shield charge stockpiled. */
  hasShield: boolean;
  /** True if the player's next turn will be auto-skipped (from skipYourTurn / stealTurn). */
  skipNextTurn: boolean;
  /** Joined the room mid-game; allowed to spectate but not to play this round. */
  isSpectator: boolean;
}

export interface CupGameConfig {
  /** Starting lives. Also the max number of spiders a player can place. */
  startingLives: number;
  rows: number;
  cols: number;
  /** Per-turn timer in seconds; null = no timer. */
  turnTimerSeconds: number | null;
}

export interface CupGameSession {
  status: CupGameStatus;
  /** Order of socketIds for turn rotation; only includes alive non-spectator players. */
  turnOrder: string[];
  currentTurnSocketId: string | null;
  pendingCard: CupGamePendingCard | null;
  /** Absolute server-time ms at which the current turn auto-ends. */
  turnDeadline: number | null;
  /** Server clock used by clients to estimate offset (same scheme as Guess It). */
  serverNow: number;
  /** Winner socketId once status === "finished" (null on draw — multiple alive at all-spiders-found). */
  winnerSocketId: string | null;
  /** Set when the game ended without a single winner — list of socketIds tied for the most lives. */
  drawWinnerSocketIds?: string[];
  /** Bumped every time the server publishes a new flip/draw event so clients can play one-shot effects without diffing arrays. */
  effectSeq: number;
  /** Most recent visible event for clients to animate. Replaced every state push. */
  lastEvent: CupGameEvent | null;
}

/** One-shot side effect a client may want to play (flip animation, hurt sound, etc.). */
export type CupGameEvent =
  | { kind: "flip"; cupIndex: number; revealedAs: "empty" | "spider"; flipperSocketId: string; ownerSocketId?: string; hit: boolean; shielded: boolean }
  | { kind: "draw"; drawerSocketId: string; cardKind: CupGameCardKind; category: CupGameCardCategory }
  | { kind: "shield"; drawerSocketId: string }
  | { kind: "skip"; targetSocketId: string; reason: "skipYourTurn" | "stealTurn" | "scheduled" }
  | { kind: "relocate"; ownerSocketId: string; fromCupIndex: number; toCupIndex: number }
  | { kind: "peek"; drawerSocketId: string; cupIndex: number; revealedAs: "empty" | "spider" }
  | { kind: "eliminate"; socketId: string }
  | { kind: "win"; socketId: string }
  | { kind: "draw_end"; reason: "all_spiders_found" };

export interface CupGameData {
  gameId: string;
  creatorSocketId: string;
  creatorName: string | null;
  config: CupGameConfig;
  cups: CupGameCup[];
  players: CupGamePlayer[];
  session: CupGameSession;
  startedAt: number | null;
  endedAt: number | null;
}

export interface CupGameStateData {
  roomId: string;
  games: CupGameData[];
}

export interface CreateCupGameOptions {
  startingLives?: number;
  /** "compact" | "standard" | "large" — server picks rows×cols accordingly. */
  gridSize?: "compact" | "standard" | "large";
  turnTimerSeconds?: number | null;
}

/**
 * Payload shape for the unified `cup_game_resolve_card` event. The server
 * cross-checks against `pendingCard.awaiting` and ignores any unexpected
 * fields. Sending an extra payload keeps the wire-format simple at the cost of
 * a slightly looser schema — that's the right tradeoff here.
 */
export interface CupGameResolvePayload {
  cupIndex?: number;
  rowIndex?: number;
  blockTopLeftCupIndex?: number;
  targetSocketId?: string;
  fromCupIndex?: number;
  toCupIndex?: number;
}

export type TimerStatus = "idle" | "running" | "paused" | "finished";

export interface TimerStateData {
  roomId: string;
  status: TimerStatus;
  durationMs: number;
  remainingMs: number;
  endsAt: number | null;
  serverNow: number;
}

export interface PlaylistItemPlayedData {
  roomId: string;
  playlistId: string;
  itemId: string;
  itemIndex: number;
  videoUrl: string;
  title: string;
}
