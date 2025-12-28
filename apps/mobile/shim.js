// This file is loaded as a polyfill BEFORE any other code runs
// It sets up SharedArrayBuffer and other globals needed by WebRTC
// NOTE: Cannot use 'require' here as module system isn't loaded yet

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

  // Minimal URL polyfill (for react-native-webrtc dependencies)
  if (typeof global.URL === "undefined") {
    global.URL = function URL(url, base) {
      // Basic URL parsing - just store the string
      this.href = base ? new URL(base).href + url : url;
      this.toString = function () {
        return this.href;
      };
    };
    global.URL.createObjectURL = function () {
      return "";
    };
    global.URL.revokeObjectURL = function () {};
  }

  if (typeof global.URLSearchParams === "undefined") {
    global.URLSearchParams = function URLSearchParams() {
      this.get = function () {
        return null;
      };
      this.set = function () {};
      this.toString = function () {
        return "";
      };
    };
  }

  // Ensure window/self have the same polyfills
  if (typeof window !== "undefined") {
    window.URL = global.URL;
    window.URLSearchParams = global.URLSearchParams;
  }
  if (typeof self !== "undefined" && self !== global) {
    self.URL = global.URL;
    self.URLSearchParams = global.URLSearchParams;
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
