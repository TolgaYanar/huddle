import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Modal,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

interface PasswordModalProps {
  visible: boolean;
  passwordError: string | null;
  onSubmit: (password: string) => void;
  onCancel: () => void;
}

export function PasswordModal({
  visible,
  passwordError,
  onSubmit,
  onCancel,
}: PasswordModalProps) {
  const [password, setPassword] = useState("");
  const router = useRouter();

  const handleSubmit = () => {
    if (password.trim()) {
      onSubmit(password.trim());
    }
  };

  const handleGoHome = () => {
    onCancel();
    router.replace("/");
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Ionicons name="lock-closed" size={24} color="#f8fafc" />
            <Text style={styles.title}>Room Password</Text>
          </View>

          <Text style={styles.message}>
            {passwordError || "This room requires a password to join."}
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Enter password"
            placeholderTextColor="#64748b"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={handleSubmit}
          />

          <View style={styles.buttons}>
            <Pressable
              style={({ pressed, focused }) => [
                styles.button,
                styles.primaryButton,
                !password.trim() && styles.buttonDisabled,
                pressed && { opacity: 0.8 },
                focused && { borderColor: "#38bdf8", borderWidth: 2 },
              ]}
              onPress={handleSubmit}
              disabled={!password.trim()}
            >
              <Text style={styles.primaryButtonText}>Join</Text>
            </Pressable>

            <Pressable
              style={({ pressed, focused }) => [
                styles.button,
                styles.secondaryButton,
                pressed && { opacity: 0.7 },
                focused && { borderColor: "#38bdf8", borderWidth: 2 },
              ]}
              onPress={handleGoHome}
            >
              <Text style={styles.secondaryButtonText}>Go Home</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modal: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "rgba(15, 23, 42, 0.95)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    padding: 24,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    color: "#f8fafc",
  },
  message: {
    fontSize: 14,
    color: "#94a3b8",
    marginBottom: 20,
  },
  input: {
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 48,
    color: "#e2e8f0",
    fontSize: 16,
    marginBottom: 20,
  },
  buttons: {
    flexDirection: "row",
    gap: 12,
  },
  button: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  primaryButton: {
    backgroundColor: "#f1f5f9",
  },
  secondaryButton: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "600",
  },
  secondaryButtonText: {
    color: "#f8fafc",
    fontSize: 14,
    fontWeight: "600",
  },
});
