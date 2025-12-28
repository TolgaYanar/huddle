// Polyfills for React Native - loaded via Metro serializer.getModulesRunBeforeMainModule
// SharedArrayBuffer polyfill
if (typeof globalThis.SharedArrayBuffer === "undefined") {
  globalThis.SharedArrayBuffer = ArrayBuffer;
}
if (typeof global.SharedArrayBuffer === "undefined") {
  global.SharedArrayBuffer = ArrayBuffer;
}

// Atomics polyfill
if (typeof globalThis.Atomics === "undefined") {
  globalThis.Atomics = {
    wait: () => "not-equal",
    notify: () => 0,
    isLockFree: () => false,
  };
}
if (typeof global.Atomics === "undefined") {
  global.Atomics = {
    wait: () => "not-equal",
    notify: () => 0,
    isLockFree: () => false,
  };
}
