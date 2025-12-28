import { useEffect, useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  Share,
  Alert,
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Video, ResizeMode, AVPlaybackStatus } from "expo-av";
import YoutubePlayer from "react-native-youtube-iframe";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import io, { Socket } from "socket.io-client";

import { PasswordModal } from "../components/PasswordModal";
import { CallSidebar } from "../components/CallSidebar";
import { useWebRTC } from "../hooks/useWebRTC";

const SOCKET_URL =
  process.env.EXPO_PUBLIC_SOCKET_URL || "http://localhost:4000";

type SyncAction = "play" | "pause" | "seek" | "change_url";

interface SyncData {
  roomId: string;
  action: SyncAction;
  timestamp: number;
  videoUrl?: string;
  senderId?: string;
}

interface ChatMessage {
  id: string;
  senderId: string;
  text: string;
  createdAt: string | Date;
}

interface ActivityEvent {
  id: string;
  kind: string;
  action?: string | null;
  senderId?: string | null;
  createdAt: string | Date;
}

export default function RoomScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const isTV = width > 1000; // Simple TV detection

  const [isConnected, setIsConnected] = useState(false);
  const [userId, setUserId] = useState("");
  const [participants, setParticipants] = useState<string[]>([]);
  const [hostId, setHostId] = useState<string | null>(null);

  // Password state
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Video state
  const [videoUrl, setVideoUrl] = useState("");
  const [inputUrl, setInputUrl] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const videoRef = useRef<Video>(null);
  const youtubeRef = useRef<any>(null);

  // Chat state
  const [messages, setMessages] = useState<(ChatMessage | ActivityEvent)[]>([]);
  const [chatText, setChatText] = useState("");
  const scrollViewRef = useRef<ScrollView>(null);

  // Call state
  const [isCallCollapsed, setIsCallCollapsed] = useState(true);
  const [callEnabled, setCallEnabled] = useState(false);

  // Socket ref
  const socketRef = useRef<Socket | null>(null);
  const isRemoteActionRef = useRef(false);

  // WebRTC hook
  const {
    localStream,
    remoteStreams,
    micEnabled,
    camEnabled,
    remoteSpeaking,
    remoteMedia,
    startLocalStream,
    stopLocalStream,
    toggleMic,
    toggleCam,
    closeAllPeers,
  } = useWebRTC({
    socket: socketRef.current,
    roomId: roomId || "",
    userId,
    isConnected,
  });

  // Helper: detect YouTube URL
  function getYoutubeId(url: string): string | null {
    if (!url) return null;
    const match = url.match(
      /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/
    );
    return match && typeof match[1] === "string" ? match[1] : null;
  }

  // Save last room
  useEffect(() => {
    if (roomId) {
      AsyncStorage.setItem("huddle:lastRoomId", roomId);
    }
  }, [roomId]);

  // Socket connection
  useEffect(() => {
    const socket = io(SOCKET_URL, {
      transports: ["websocket"],
      autoConnect: false,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("Connected to server");
      setIsConnected(true);
      setUserId(socket.id || "");

      // Try to get saved password
      AsyncStorage.getItem(`huddle:roomPassword:${roomId}`).then((password) => {
        socket.emit("join_room", roomId, password || undefined);
      });
    });

    socket.on("disconnect", () => {
      console.log("Disconnected from server");
      setIsConnected(false);
    });

    socket.on("room_users", (data: { users: string[]; hostId?: string }) => {
      setParticipants(data.users.filter((id) => id !== socket.id));
      if (data.hostId) setHostId(data.hostId);
      setPasswordRequired(false);
      setPasswordError(null);
    });

    socket.on("user_joined", (id: string) => {
      if (id !== socket.id) {
        setParticipants((prev) => [...prev.filter((p) => p !== id), id]);
      }
    });

    socket.on("user_left", (id: string) => {
      setParticipants((prev) => prev.filter((p) => p !== id));
    });

    socket.on("room_requires_password", (data: { reason?: string }) => {
      setPasswordRequired(true);
      if (data.reason === "invalid") {
        setPasswordError("Wrong password. Try again.");
      } else {
        setPasswordError(null);
      }
    });

    socket.on(
      "room_state",
      (data: { videoUrl?: string; timestamp?: number; action?: string }) => {
        if (data.videoUrl) {
          setVideoUrl(data.videoUrl);
          setInputUrl(data.videoUrl);
        }
        if (data.timestamp !== undefined) {
          setCurrentTime(data.timestamp);
          videoRef.current?.setPositionAsync(data.timestamp * 1000);
        }
        if (data.action === "play") {
          setIsPlaying(true);
        } else if (data.action === "pause") {
          setIsPlaying(false);
        }
      }
    );

    socket.on("sync", (data: SyncData) => {
      if (data.senderId === socket.id) return;

      isRemoteActionRef.current = true;

      switch (data.action) {
        case "play":
          setIsPlaying(true);
          if (data.timestamp !== undefined) {
            videoRef.current?.setPositionAsync(data.timestamp * 1000);
          }
          break;
        case "pause":
          setIsPlaying(false);
          break;
        case "seek":
          if (data.timestamp !== undefined) {
            videoRef.current?.setPositionAsync(data.timestamp * 1000);
            setCurrentTime(data.timestamp);
          }
          break;
        case "change_url":
          if (data.videoUrl) {
            setVideoUrl(data.videoUrl);
            setInputUrl(data.videoUrl);
          }
          break;
      }

      setTimeout(() => {
        isRemoteActionRef.current = false;
      }, 500);
    });

    socket.on("chat_history", (data: { messages: ChatMessage[] }) => {
      setMessages((prev) => [...data.messages, ...prev]);
    });

    socket.on("chat_message", (msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg]);
    });

    socket.on("activity_history", (data: { events: ActivityEvent[] }) => {
      // Merge activity events
    });

    socket.on("activity_event", (event: ActivityEvent) => {
      setMessages((prev) => [...prev, event]);
    });

    socket.connect();

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [roomId]);

  // Auto-scroll chat
  useEffect(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages]);

  const sendSync = useCallback(
    (action: SyncAction, timestamp: number, videoUrl?: string) => {
      if (isRemoteActionRef.current) return;
      socketRef.current?.emit("sync", {
        roomId,
        action,
        timestamp,
        videoUrl,
      });
    },
    [roomId]
  );

  const handlePlaybackStatusUpdate = (status: AVPlaybackStatus) => {
    if (!status.isLoaded) {
      setIsBuffering(true);
      return;
    }
    setIsBuffering(status.isBuffering);
    setCurrentTime((status.positionMillis || 0) / 1000);
    setDuration((status.durationMillis || 0) / 1000);
  };

  const handleLoadUrl = () => {
    if (!inputUrl.trim()) return;
    setVideoUrl(inputUrl.trim());
    sendSync("change_url", 0, inputUrl.trim());
  };

  const handlePlayPause = async () => {
    if (!videoRef.current) return;
    const status = await videoRef.current.getStatusAsync();
    if (!status.isLoaded) return;

    if (status.isPlaying) {
      await videoRef.current.pauseAsync();
      setIsPlaying(false);
      sendSync("pause", status.positionMillis / 1000);
    } else {
      await videoRef.current.playAsync();
      setIsPlaying(true);
      sendSync("play", status.positionMillis / 1000);
    }
  };

  const handleSeek = async (direction: "back" | "forward") => {
    if (!videoRef.current) return;
    const status = await videoRef.current.getStatusAsync();
    if (!status.isLoaded) return;

    const offset = direction === "back" ? -10000 : 10000;
    const newPos = Math.max(0, status.positionMillis + offset);
    await videoRef.current.setPositionAsync(newPos);
    sendSync("seek", newPos / 1000);
  };

  const handleSendChat = () => {
    if (!chatText.trim() || !socketRef.current) return;
    socketRef.current.emit("chat_message", {
      roomId,
      text: chatText.trim(),
    });
    setChatText("");
  };

  const shareRoom = async () => {
    try {
      await Share.share({
        message: `Join my Huddle room: huddle://room/${roomId}`,
        url: `https://huddle.app/r/${roomId}`,
      });
    } catch (error) {
      Alert.alert("Error", "Could not share the room link");
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const isChat = (item: ChatMessage | ActivityEvent): item is ChatMessage => {
    return "text" in item;
  };

  const submitPassword = (password: string) => {
    AsyncStorage.setItem(`huddle:roomPassword:${roomId}`, password);
    socketRef.current?.emit("join_room", roomId, password);
  };

  const handleJoinCall = async () => {
    setCallEnabled(true);
    setIsCallCollapsed(false);
    await startLocalStream(true, false);
  };

  const handleLeaveCall = () => {
    setCallEnabled(false);
    setIsCallCollapsed(true);
    stopLocalStream();
    closeAllPeers();
  };

  const VIDEO_HEIGHT = isLandscape ? height * 0.5 : (width * 9) / 16;

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerStyle: {
            backgroundColor: "rgba(0,0,0,0.3)",
          },
          headerTintColor: "#f8fafc",
          headerTitle: () => (
            <View style={styles.headerTitle}>
              <View
                style={[
                  styles.connectionDot,
                  { backgroundColor: isConnected ? "#22c55e" : "#ef4444" },
                ]}
              />
              <Text style={styles.headerText} numberOfLines={1}>
                {roomId}
              </Text>
            </View>
          ),
          headerLeft: () => (
            <Pressable
              onPress={() => router.back()}
              style={({ pressed, focused }) => [
                styles.headerButton,
                pressed && { opacity: 0.7 },
                focused && { backgroundColor: "rgba(255,255,255,0.1)" },
              ]}
            >
              <Ionicons name="chevron-back" size={24} color="#f8fafc" />
            </Pressable>
          ),
          headerRight: () => (
            <View style={styles.headerRight}>
              <Pressable
                onPress={shareRoom}
                style={({ pressed, focused }) => [
                  styles.headerButton,
                  pressed && { opacity: 0.7 },
                  focused && { backgroundColor: "rgba(255,255,255,0.1)" },
                ]}
              >
                <Ionicons name="share-outline" size={22} color="#f8fafc" />
              </Pressable>
              <View style={styles.participantBadge}>
                <Ionicons name="people" size={14} color="#94a3b8" />
                <Text style={styles.participantCount}>
                  {participants.length + 1}
                </Text>
              </View>
            </View>
          ),
        }}
      />

      {/* Password Modal */}
      <PasswordModal
        visible={passwordRequired}
        passwordError={passwordError}
        onSubmit={submitPassword}
        onCancel={() => router.replace("/")}
      />

      <SafeAreaView style={styles.container} edges={["bottom"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.flex}
          keyboardVerticalOffset={90}
        >
          {/* Main Content - Landscape layout for TV */}
          <View style={[styles.mainContent, isLandscape && styles.landscapeContent]}>
            {/* Video Section */}
            <View style={[styles.videoSection, isLandscape && styles.landscapeVideo]}>
              {/* URL Input */}
              <View style={styles.urlRow}>
                <TextInput
                  style={styles.urlInput}
                  placeholder="Paste video URL (YouTube, etc.)"
                  placeholderTextColor="#64748b"
                  value={inputUrl}
                  onChangeText={setInputUrl}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="go"
                  onSubmitEditing={handleLoadUrl}
                />
                <Pressable
                  style={({ pressed, focused }) => [
                    styles.loadButton,
                    pressed && { opacity: 0.8 },
                    focused && {
                      borderColor: "#38bdf8",
                      borderWidth: 2,
                      transform: [{ scale: 1.05 }],
                    },
                  ]}
                  onPress={handleLoadUrl}
                >
                  <Ionicons name="play-circle" size={24} color="#f8fafc" />
                </Pressable>
              </View>

              {/* Video Player */}
              <View style={[styles.videoContainer, { height: VIDEO_HEIGHT }]}>
                {videoUrl ? (
                  getYoutubeId(videoUrl) ? (
                    <YoutubePlayer
                      ref={youtubeRef}
                      height={VIDEO_HEIGHT}
                      width={"100%"}
                      videoId={getYoutubeId(videoUrl)!}
                      play={isPlaying}
                      onChangeState={(state: string) => {
                        if (state === "playing" && !isPlaying) setIsPlaying(true);
                        if ((state === "paused" || state === "ended") && isPlaying)
                          setIsPlaying(false);
                      }}
                      onReady={() => setIsBuffering(false)}
                      onError={(_e: unknown) => setIsBuffering(false)}
                      onPlaybackQualityChange={(_q: unknown) => {}}
                      onPlaybackRateChange={(_r: unknown) => {}}
                      forceAndroidAutoplay
                    />
                  ) : (
                    <>
                      <Video
                        ref={videoRef}
                        source={{ uri: videoUrl }}
                        style={styles.video}
                        resizeMode={ResizeMode.CONTAIN}
                        shouldPlay={isPlaying}
                        isLooping={false}
                        onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
                        useNativeControls={false}
                      />
                      {isBuffering && (
                        <View style={styles.bufferingOverlay}>
                          <ActivityIndicator size="large" color="#f8fafc" />
                        </View>
                      )}
                    </>
                  )
                ) : (
                  <View style={styles.videoPlaceholder}>
                    <Ionicons name="videocam-outline" size={48} color="#475569" />
                    <Text style={styles.placeholderText}>
                      Paste a video URL above to start watching
                    </Text>
                  </View>
                )}
              </View>

              {/* Controls */}
              {videoUrl && (
                <View style={styles.controls}>
                  <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
                  <View style={styles.controlButtons}>
                    <Pressable
                      onPress={() => handleSeek("back")}
                      style={({ pressed, focused }) => [
                        styles.controlButton,
                        pressed && { opacity: 0.7 },
                        focused && { backgroundColor: "rgba(255,255,255,0.1)" },
                      ]}
                    >
                      <Ionicons name="play-back" size={24} color="#f8fafc" />
                    </Pressable>
                    <Pressable
                      onPress={handlePlayPause}
                      style={({ pressed, focused }) => [
                        styles.playButton,
                        pressed && { opacity: 0.8 },
                        focused && {
                          borderColor: "#38bdf8",
                          borderWidth: 2,
                          transform: [{ scale: 1.05 }],
                        },
                      ]}
                    >
                      <Ionicons
                        name={isPlaying ? "pause" : "play"}
                        size={28}
                        color="#0f172a"
                      />
                    </Pressable>
                    <Pressable
                      onPress={() => handleSeek("forward")}
                      style={({ pressed, focused }) => [
                        styles.controlButton,
                        pressed && { opacity: 0.7 },
                        focused && { backgroundColor: "rgba(255,255,255,0.1)" },
                      ]}
                    >
                      <Ionicons name="play-forward" size={24} color="#f8fafc" />
                    </Pressable>
                  </View>
                  <Text style={styles.timeText}>{formatTime(duration)}</Text>
                </View>
              )}

              {/* Join Call Button */}
              {!callEnabled && (
                <Pressable
                  style={({ pressed, focused }) => [
                    styles.joinCallButton,
                    pressed && { opacity: 0.8 },
                    focused && { borderColor: "#38bdf8", borderWidth: 2 },
                  ]}
                  onPress={handleJoinCall}
                >
                  <Ionicons name="call" size={20} color="#f8fafc" />
                  <Text style={styles.joinCallText}>Join Voice Chat</Text>
                </Pressable>
              )}
            </View>

            {/* Chat Section */}
            <View style={[styles.chatSection, isLandscape && styles.landscapeChat]}>
              <View style={styles.chatHeader}>
                <Ionicons name="chatbubbles" size={18} color="#94a3b8" />
                <Text style={styles.chatHeaderText}>Activity & Chat</Text>
              </View>

              <ScrollView
                ref={scrollViewRef}
                style={styles.chatMessages}
                contentContainerStyle={styles.chatContent}
              >
                {messages.map((item, index) => (
                  <View
                    key={item.id || index}
                    style={[
                      styles.messageRow,
                      isChat(item)
                        ? item.senderId === userId
                          ? styles.myMessage
                          : styles.otherMessage
                        : styles.activityMessage,
                    ]}
                  >
                    {isChat(item) ? (
                      <>
                        <Text style={styles.messageSender}>
                          {item.senderId === userId
                            ? "You"
                            : item.senderId?.slice(0, 6)}
                        </Text>
                        <Text style={styles.messageText}>{item.text}</Text>
                      </>
                    ) : (
                      <Text style={styles.activityText}>
                        {item.senderId?.slice(0, 6) || "Someone"} {item.kind}
                        {item.action ? ` (${item.action})` : ""}
                      </Text>
                    )}
                  </View>
                ))}
              </ScrollView>

              <View style={styles.chatInputRow}>
                <TextInput
                  style={styles.chatInput}
                  placeholder="Send a message..."
                  placeholderTextColor="#64748b"
                  value={chatText}
                  onChangeText={setChatText}
                  returnKeyType="send"
                  onSubmitEditing={handleSendChat}
                />
                <Pressable
                  style={({ pressed, focused }) => [
                    styles.sendButton,
                    pressed && { opacity: 0.7 },
                    focused && { backgroundColor: "rgba(255,255,255,0.1)" },
                  ]}
                  onPress={handleSendChat}
                  disabled={!chatText.trim()}
                >
                  <Ionicons
                    name="send"
                    size={20}
                    color={chatText.trim() ? "#f8fafc" : "#475569"}
                  />
                </Pressable>
              </View>
            </View>
          </View>

          {/* Call Sidebar */}
          {callEnabled && (
            <CallSidebar
              isCollapsed={isCallCollapsed}
              onToggleCollapse={() => setIsCallCollapsed(!isCallCollapsed)}
              userId={userId}
              participants={participants}
              localStream={localStream}
              remoteStreams={remoteStreams}
              micEnabled={micEnabled}
              camEnabled={camEnabled}
              remoteSpeaking={remoteSpeaking}
              remoteMedia={remoteMedia}
              onToggleMic={toggleMic}
              onToggleCam={toggleCam}
              onLeaveCall={handleLeaveCall}
            />
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: "#020617",
  },
  mainContent: {
    flex: 1,
  },
  landscapeContent: {
    flexDirection: "row",
  },
  headerTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  connectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  headerText: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "600",
    maxWidth: 150,
  },
  headerButton: {
    padding: 8,
    borderRadius: 8,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  participantBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  participantCount: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "500",
  },
  videoSection: {
    padding: 16,
    gap: 12,
  },
  landscapeVideo: {
    flex: 2,
  },
  urlRow: {
    flexDirection: "row",
    gap: 8,
  },
  urlInput: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 44,
    color: "#e2e8f0",
    fontSize: 14,
  },
  loadButton: {
    backgroundColor: "#6366f1",
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#6366f1",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
  },
  videoContainer: {
    width: "100%",
    backgroundColor: "#000",
    borderRadius: 12,
    overflow: "hidden",
  },
  video: {
    width: "100%",
    height: "100%",
  },
  bufferingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  videoPlaceholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  placeholderText: {
    color: "#475569",
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: 32,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
  },
  timeText: {
    color: "#94a3b8",
    fontSize: 12,
    fontVariant: ["tabular-nums"],
    minWidth: 45,
  },
  controlButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  controlButton: {
    padding: 8,
    borderRadius: 8,
  },
  playButton: {
    backgroundColor: "#f1f5f9",
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  joinCallButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#22c55e",
    height: 44,
    borderRadius: 12,
    marginTop: 8,
  },
  joinCallText: {
    color: "#f8fafc",
    fontSize: 14,
    fontWeight: "600",
  },
  chatSection: {
    flex: 1,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  landscapeChat: {
    flex: 1,
    borderTopWidth: 0,
    borderLeftWidth: 1,
    borderLeftColor: "rgba(255,255,255,0.1)",
  },
  chatHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  chatHeaderText: {
    color: "#94a3b8",
    fontSize: 14,
    fontWeight: "500",
  },
  chatMessages: {
    flex: 1,
  },
  chatContent: {
    padding: 12,
    gap: 8,
  },
  messageRow: {
    padding: 10,
    borderRadius: 12,
    maxWidth: "85%",
  },
  myMessage: {
    backgroundColor: "#6366f1",
    alignSelf: "flex-end",
    shadowColor: "#6366f1",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
  otherMessage: {
    backgroundColor: "rgba(255,255,255,0.1)",
    alignSelf: "flex-start",
  },
  activityMessage: {
    backgroundColor: "rgba(255,255,255,0.05)",
    alignSelf: "center",
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  messageSender: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 11,
    marginBottom: 2,
  },
  messageText: {
    color: "#f8fafc",
    fontSize: 14,
  },
  activityText: {
    color: "#94a3b8",
    fontSize: 12,
  },
  chatInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
  },
  chatInput: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 20,
    paddingHorizontal: 16,
    height: 40,
    color: "#e2e8f0",
    fontSize: 14,
  },
  sendButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 20,
  },
});
