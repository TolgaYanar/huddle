// URL polyfills need to load before expo-router
import "react-native-url-polyfill/auto";
// Entry point - SharedArrayBuffer polyfills are loaded via Metro's getPolyfills in shim.js
import "expo-router/entry";
