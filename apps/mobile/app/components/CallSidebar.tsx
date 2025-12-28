import React from "react";
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { RTCView, MediaStream } from "react-native-webrtc";

interface RemoteStreamEntry {
  id: string;
  stream: MediaStream;
}

interface WebRTCMediaState {
  mic: boolean;
  cam: boolean;
}

interface CallSidebarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  userId: string;
  participants: string[];
  localStream: MediaStream | null;
  remoteStreams: RemoteStreamEntry[];
  micEnabled: boolean;
  camEnabled: boolean;
  remoteSpeaking: Record<string, boolean>;
  remoteMedia: Record<string, WebRTCMediaState>;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onLeaveCall: () => void;
}

export function CallSidebar({
  isCollapsed,
  onToggleCollapse,
  userId,
  participants,
  localStream,
  remoteStreams,
  micEnabled,
  camEnabled,
  remoteSpeaking,
  remoteMedia,
  onToggleMic,
  onToggleCam,
  onLeaveCall,
}: CallSidebarProps) {
  if (isCollapsed) {
    return (
      <Pressable
        style={({ pressed }) => [
          styles.collapsedBar,
          pressed && { opacity: 0.8 },
        ]}
        onPress={onToggleCollapse}
      >
        <Ionicons name="call" size={20} color="#f8fafc" />
        <Text style={styles.collapsedText}>
          {participants.length + 1} in call
        </Text>
        <Ionicons name="chevron-up" size={20} color="#94a3b8" />
      </Pressable>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <Pressable
        style={({ pressed }) => [styles.header, pressed && { opacity: 0.8 }]}
        onPress={onToggleCollapse}
      >
        <View style={styles.headerLeft}>
          <Ionicons name="call" size={18} color="#94a3b8" />
          <Text style={styles.headerText}>Voice Call</Text>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.participantBadge}>
            <Text style={styles.participantCount}>
              {participants.length + 1}
            </Text>
          </View>
          <Ionicons name="chevron-down" size={20} color="#94a3b8" />
        </View>
      </Pressable>

      {/* Participants */}
      <ScrollView style={styles.participantsList}>
        {/* Local User (You) */}
        <View style={styles.participantRow}>
          <View style={styles.avatarContainer}>
            {localStream && camEnabled ? (
              <RTCView
                streamURL={localStream.toURL()}
                style={styles.videoPreview}
                objectFit="cover"
                mirror={true}
              />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {userId?.slice(0, 2).toUpperCase() || "ME"}
                </Text>
              </View>
            )}
            {micEnabled && (
              <View
                style={[
                  styles.speakingIndicator,
                  { backgroundColor: "#22c55e" },
                ]}
              />
            )}
          </View>
          <View style={styles.participantInfo}>
            <Text style={styles.participantName}>You</Text>
            <View style={styles.mediaStatus}>
              <Ionicons
                name={micEnabled ? "mic" : "mic-off"}
                size={14}
                color={micEnabled ? "#22c55e" : "#ef4444"}
              />
              <Ionicons
                name={camEnabled ? "videocam" : "videocam-off"}
                size={14}
                color={camEnabled ? "#22c55e" : "#64748b"}
              />
            </View>
          </View>
        </View>

        {/* Remote Participants */}
        {participants.map((peerId) => {
          const remoteStream = remoteStreams.find((rs) => rs.id === peerId);
          const mediaState = remoteMedia[peerId] || { mic: false, cam: false };
          const speaking = remoteSpeaking[peerId] || false;

          return (
            <View key={peerId} style={styles.participantRow}>
              <View style={styles.avatarContainer}>
                {remoteStream && mediaState.cam ? (
                  <RTCView
                    streamURL={remoteStream.stream.toURL()}
                    style={styles.videoPreview}
                    objectFit="cover"
                  />
                ) : (
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {peerId.slice(0, 2).toUpperCase()}
                    </Text>
                  </View>
                )}
                {speaking && (
                  <View
                    style={[
                      styles.speakingIndicator,
                      { backgroundColor: "#22c55e" },
                    ]}
                  />
                )}
              </View>
              <View style={styles.participantInfo}>
                <Text style={styles.participantName}>{peerId.slice(0, 8)}</Text>
                <View style={styles.mediaStatus}>
                  <Ionicons
                    name={mediaState.mic ? "mic" : "mic-off"}
                    size={14}
                    color={mediaState.mic ? "#22c55e" : "#ef4444"}
                  />
                  <Ionicons
                    name={mediaState.cam ? "videocam" : "videocam-off"}
                    size={14}
                    color={mediaState.cam ? "#22c55e" : "#64748b"}
                  />
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Controls */}
      <View style={styles.controls}>
        <Pressable
          style={({ pressed, focused }) => [
            styles.controlButton,
            micEnabled ? styles.controlActive : styles.controlInactive,
            pressed && { opacity: 0.8 },
            focused && { borderColor: "#38bdf8", borderWidth: 2 },
          ]}
          onPress={onToggleMic}
        >
          <Ionicons
            name={micEnabled ? "mic" : "mic-off"}
            size={20}
            color={micEnabled ? "#22c55e" : "#ef4444"}
          />
        </Pressable>

        <Pressable
          style={({ pressed, focused }) => [
            styles.controlButton,
            camEnabled ? styles.controlActive : styles.controlInactive,
            pressed && { opacity: 0.8 },
            focused && { borderColor: "#38bdf8", borderWidth: 2 },
          ]}
          onPress={onToggleCam}
        >
          <Ionicons
            name={camEnabled ? "videocam" : "videocam-off"}
            size={20}
            color={camEnabled ? "#22c55e" : "#64748b"}
          />
        </Pressable>

        <Pressable
          style={({ pressed, focused }) => [
            styles.controlButton,
            styles.leaveButton,
            pressed && { opacity: 0.8 },
            focused && { borderColor: "#38bdf8", borderWidth: 2 },
          ]}
          onPress={onLeaveCall}
        >
          <Ionicons name="call" size={20} color="#ef4444" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.1)",
    maxHeight: 300,
  },
  collapsedBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.1)",
  },
  collapsedText: {
    color: "#f8fafc",
    fontSize: 14,
    fontWeight: "500",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerText: {
    color: "#94a3b8",
    fontSize: 14,
    fontWeight: "500",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  participantBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  participantCount: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "500",
  },
  participantsList: {
    flex: 1,
    padding: 12,
  },
  participantRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  avatarContainer: {
    position: "relative",
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(99, 102, 241, 0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    color: "#f8fafc",
    fontSize: 14,
    fontWeight: "600",
  },
  videoPreview: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: "hidden",
  },
  speakingIndicator: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#020617",
  },
  participantInfo: {
    flex: 1,
  },
  participantName: {
    color: "#f8fafc",
    fontSize: 14,
    fontWeight: "500",
  },
  mediaStatus: {
    flexDirection: "row",
    gap: 8,
    marginTop: 2,
  },
  controls: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.05)",
  },
  controlButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  controlActive: {
    backgroundColor: "rgba(34, 197, 94, 0.2)",
  },
  controlInactive: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  leaveButton: {
    backgroundColor: "rgba(239, 68, 68, 0.2)",
  },
});
