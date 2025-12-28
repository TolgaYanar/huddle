import "react-native-get-random-values";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

// Polyfill SharedArrayBuffer for React Native
if (typeof global.SharedArrayBuffer === "undefined") {
  global.SharedArrayBuffer = ArrayBuffer;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#0f172a" },
          animation: "slide_from_right",
        }}
      />
    </SafeAreaProvider>
  );
}
