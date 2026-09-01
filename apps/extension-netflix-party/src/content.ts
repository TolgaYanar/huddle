// Vite entry point for the content script. The full implementation lives in
// the modular `./content/` directory; this file just bootstraps it.
//
// Previously this file also contained 978 lines of a single-file legacy
// implementation (socket.io-client import, RoomState type, inlined player
// sync, etc.) — that code was abandoned in favour of the modular split and
// vite was already tree-shaking it from the bundle. Source has been cleaned
// up to match.
import { initContentScript } from "./content/init";

declare global {
  interface Window {
    __huddleContentScriptLoaded?: boolean;
  }
}

// Dynamic registration plus an immediate executeScript can overlap on the
// first enabled Prime tab. The isolated world is shared by this extension, so
// this guard makes injection idempotent without leaking anything to the page.
if (!window.__huddleContentScriptLoaded) {
  window.__huddleContentScriptLoaded = true;
  initContentScript();
}
