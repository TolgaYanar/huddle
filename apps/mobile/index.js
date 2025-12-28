// Polyfills must be set BEFORE any imports (cannot use import for this)
// SharedArrayBuffer polyfill for Hermes
if (typeof global.SharedArrayBuffer === "undefined") {
  global.SharedArrayBuffer = ArrayBuffer;
}

// Atomics polyfill
if (typeof global.Atomics === "undefined") {
  global.Atomics = {
    wait: () => "not-equal",
    notify: () => 0,
    isLockFree: () => false,
  };
}

// Now load the app
require("expo-router/entry");
