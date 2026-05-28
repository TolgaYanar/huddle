// Vite entry point for the content script. The full implementation lives in
// the modular `./content/` directory; this file just bootstraps it.
//
// Previously this file also contained 978 lines of a single-file legacy
// implementation (socket.io-client import, RoomState type, inlined player
// sync, etc.) — that code was abandoned in favour of the modular split and
// vite was already tree-shaking it from the bundle. Source has been cleaned
// up to match.
import { initContentScript } from "./content/init";

initContentScript();
