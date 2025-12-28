// This file is loaded as a polyfill BEFORE any other code runs
// It sets up SharedArrayBuffer and other globals needed by WebRTC

// Import URL polyfills first
require("react-native-url-polyfill/auto");

(function (global) {
  "use strict";

  // SharedArrayBuffer polyfill
  if (typeof global.SharedArrayBuffer === "undefined") {
    global.SharedArrayBuffer = ArrayBuffer;
  }

  // Atomics polyfill
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
      add: function () {
        return 0;
      },
      and: function () {
        return 0;
      },
      compareExchange: function () {
        return 0;
      },
      exchange: function () {
        return 0;
      },
      load: function () {
        return 0;
      },
      or: function () {
        return 0;
      },
      store: function () {
        return 0;
      },
      sub: function () {
        return 0;
      },
      xor: function () {
        return 0;
      },
    };
  }

  // Also set on globalThis if available
  if (typeof globalThis !== "undefined") {
    if (typeof globalThis.SharedArrayBuffer === "undefined") {
      globalThis.SharedArrayBuffer = ArrayBuffer;
    }
    if (typeof globalThis.Atomics === "undefined") {
      globalThis.Atomics = global.Atomics;
    }
  }
})(
  typeof globalThis !== "undefined"
    ? globalThis
    : typeof global !== "undefined"
      ? global
      : typeof self !== "undefined"
        ? self
        : this
);
