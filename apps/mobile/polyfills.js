// Polyfills for React Native - must be loaded before any other modules
if (typeof global.SharedArrayBuffer === "undefined") {
  global.SharedArrayBuffer = ArrayBuffer;
}

if (typeof global.Atomics === "undefined") {
  global.Atomics = {
    wait: () => "not-equal",
    notify: () => 0,
    isLockFree: () => false,
  };
}
