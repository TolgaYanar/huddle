import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";

function generateRoomId() {
  const alphabet = "23456789abcdefghjkmnpqrstuvwxyz";
  let result = "";
  for (let i = 0; i < 10; i++) {
    result += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return result;
}

function normalizeRoomId(input: string) {
  const raw = input.trim();
  if (!raw) return "";

  // Accept full invite links too (e.g. http://host:3002/r/abc123)
  const match = raw.match(/\/r\/([^/?#]+)/i);
  const extracted = match?.[1] ? decodeURIComponent(match[1]) : raw;

  const trimmed = extracted.trim().toLowerCase();
  const cleaned = trimmed.replace(/[^a-z0-9_-]+/g, "-").replace(/-+/g, "-");
  return cleaned.replace(/^-+|-+$/g, "");
}

export default function HomeScreen() {
  const router = useRouter();
  const [joinValue, setJoinValue] = useState("");
  const [lastRoomId, setLastRoomId] = useState<string | null>(null);
  const normalizedJoin = normalizeRoomId(joinValue);

  useEffect(() => {
    AsyncStorage.getItem("huddle:lastRoomId").then((val) => {
      if (val) setLastRoomId(val);
    });
  }, []);

  const createRoom = () => {
    const newRoomId = generateRoomId();
    AsyncStorage.setItem("huddle:lastRoomId", newRoomId);
    router.push(`/room/${newRoomId}`);
  };

  const joinRoom = () => {
    if (!normalizedJoin) {
      Alert.alert("Invalid room", "Please enter a valid room name or link");
      return;
    }
    AsyncStorage.setItem("huddle:lastRoomId", normalizedJoin);
    router.push(`/room/${normalizedJoin}`);
  };

  const continueLastRoom = () => {
    if (lastRoomId) {
      router.push(`/room/${lastRoomId}`);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.content}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.emoji}>🍿</Text>
          <Text style={styles.title}>Huddle</Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Create or join a room</Text>
          <Text style={styles.cardSubtitle}>
            Rooms are just links you can share with friends.
          </Text>

          <View style={styles.buttonGroup}>
            {lastRoomId && (
              <Pressable
                style={({ pressed, focused }) => [
                  styles.secondaryButton,
                  pressed && { opacity: 0.7 },
                  focused && {
                    borderColor: "#38bdf8",
                    borderWidth: 2,
                    transform: [{ scale: 1.02 }],
                  },
                ]}
                onPress={continueLastRoom}
              >
                <Ionicons name="arrow-forward" size={18} color="#e2e8f0" />
                <Text style={styles.secondaryButtonText}>
                  Continue last room
                </Text>
              </Pressable>
            )}

            <Pressable
              style={({ pressed, focused }) => [
                styles.primaryButton,
                pressed && { opacity: 0.8 },
                focused && {
                  borderColor: "#38bdf8",
                  borderWidth: 2,
                  transform: [{ scale: 1.02 }],
                },
              ]}
              onPress={createRoom}
            >
              <Ionicons name="add-circle" size={20} color="#0f172a" />
              <Text style={styles.primaryButtonText}>Create a new room</Text>
            </Pressable>

            <View style={styles.joinRow}>
              <TextInput
                style={styles.input}
                placeholder="Room name or invite link"
                placeholderTextColor="#64748b"
                value={joinValue}
                onChangeText={setJoinValue}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="go"
                onSubmitEditing={joinRoom}
              />
              <Pressable
                style={({ pressed, focused }) => [
                  styles.joinButton,
                  !normalizedJoin && styles.joinButtonDisabled,
                  pressed && { opacity: 0.7 },
                  focused && {
                    borderColor: "#38bdf8",
                    borderWidth: 2,
                    transform: [{ scale: 1.02 }],
                  },
                ]}
                onPress={joinRoom}
                disabled={!normalizedJoin}
              >
                <Text style={styles.joinButtonText}>Join</Text>
              </Pressable>
            </View>

            <Text style={styles.hint}>
              Tip: share a room by sending its link (e.g. /r/neon-penguin-42)
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#020617",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 48,
    gap: 8,
  },
  emoji: {
    fontSize: 28,
  },
  title: {
    fontSize: 24,
    fontWeight: "600",
    color: "#f8fafc",
    letterSpacing: -0.3,
  },
  card: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#f8fafc",
  },
  cardSubtitle: {
    fontSize: 14,
    color: "#94a3b8",
    marginTop: 4,
  },
  buttonGroup: {
    marginTop: 20,
    gap: 12,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#f1f5f9",
    height: 44,
    borderRadius: 12,
  },
  primaryButtonText: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "600",
  },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    height: 44,
    borderRadius: 12,
  },
  secondaryButtonText: {
    color: "#f8fafc",
    fontSize: 14,
    fontWeight: "600",
  },
  joinRow: {
    flexDirection: "row",
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.2)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 44,
    color: "#e2e8f0",
    fontSize: 14,
  },
  joinButton: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 12,
    justifyContent: "center",
  },
  joinButtonDisabled: {
    opacity: 0.5,
  },
  joinButtonText: {
    color: "#f8fafc",
    fontSize: 14,
    fontWeight: "500",
  },
  hint: {
    fontSize: 12,
    color: "#64748b",
    textAlign: "center",
    marginTop: 4,
  },
});
