// Polyfills MUST be defined before ANY require/import
// Using direct assignment to avoid any module resolution
(function () {
  "use strict";
  if (typeof global !== "undefined") {
    if (typeof global.SharedArrayBuffer === "undefined") {
      global.SharedArrayBuffer = ArrayBuffer;
    }
    if (typeof global.Atomics === "undefined") {
      global.Atomics = {
        wait: function () {
          return "not-equal";
        },
        notify: function () {
          return 0;
        },
        isLockFree: function () {
          return false;
        },
      };
    }
  }
  if (typeof globalThis !== "undefined") {
    if (typeof globalThis.SharedArrayBuffer === "undefined") {
      globalThis.SharedArrayBuffer = ArrayBuffer;
    }
    if (typeof globalThis.Atomics === "undefined") {
      globalThis.Atomics = {
        wait: function () {
          return "not-equal";
        },
        notify: function () {
          return 0;
        },
        isLockFree: function () {
          return false;
        },
      };
    }
  }
})();

// Now load the app
require("expo-router/entry");
