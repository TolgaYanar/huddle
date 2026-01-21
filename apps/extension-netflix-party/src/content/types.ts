export type ExtensionConfig = {
  serverUrl: string;
  roomId: string;
};

export type RoomState = {
  roomId: string;
  serverNow?: number;
  videoUrl?: string;
  timestamp?: number;
  updatedAt?: number;
  isPlaying?: boolean;
  playbackSpeed?: number;
  volume?: number;
  isMuted?: boolean;
  rev?: number;
};

export type ChatMessage = {
  id?: string;
  roomId: string;
  senderId: string;
  senderUsername?: string | null;
  text: string;
  createdAt?: string | Date;
};
