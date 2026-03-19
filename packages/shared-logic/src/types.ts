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
  turnNumber: number;
}

export interface GameWinner {
  socketId: string;
  username: string | null;
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
  wins: number;
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
