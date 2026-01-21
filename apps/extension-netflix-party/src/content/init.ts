import type { ExtensionConfig } from "./types";
import { FIXED_SERVER_URL, STORAGE_KEYS } from "./constants";
import { createInitialState } from "./state";
import { ensureOverlay, updateOverlay } from "./overlay";
import { loadConfig } from "./config";
import { ensureVideoListeners } from "./playerSync";
import { safeNetflixSetPlayingViaBackground } from "./netflixBackground";
import { connect, disconnect, emitSync, shouldEmitLocalSync } from "./socket";

export function initContentScript() {
  const state = createInitialState();

  const ensureOverlayBound = () =>
    ensureOverlay(state, {
      onSendChat: (text) => {
        const s = state.socket;
        const roomId = state.currentRoomId;
        if (!s || !roomId) return;
        s.emit("send_chat", { roomId, text });
      },
    });

  const updateOverlayBound = () => updateOverlay(state);

  const ensureVideoListenersBound = () => {
    ensureVideoListeners(state, {
      emitSync: (action, ts) => emitSync(state, action, ts),
      shouldEmitLocalSync: () => shouldEmitLocalSync(state),
    });
  };

  chrome.runtime.onMessage.addListener(
    (msg: any, _sender: any, sendResponse: any) => {
      if (msg?.type === "HUDDLE_CONNECT") {
        const cfg: ExtensionConfig = {
          serverUrl: FIXED_SERVER_URL,
          roomId: msg.roomId,
        };
        chrome.storage.local.set({ [STORAGE_KEYS.roomId]: cfg.roomId });
        connect(state, cfg, {
          ensureOverlay: ensureOverlayBound,
          updateOverlay: updateOverlayBound,
        });
        sendResponse({ ok: true });
        return true;
      }

      if (msg?.type === "HUDDLE_DISCONNECT") {
        disconnect(state, { updateOverlay: updateOverlayBound });
        sendResponse({ ok: true });
        return true;
      }

      if (msg?.type === "HUDDLE_GET_STATUS") {
        sendResponse({
          connected: Boolean(state.socket && state.socket.connected),
          roomId: state.currentRoomId,
        });
        return true;
      }

      return false;
    },
  );

  (async () => {
    if (!location.pathname.startsWith("/watch/")) return;

    const markGesture = () => {
      state.lastUserGestureAt = Date.now();
      if (!state.hasUserGesture) state.hasUserGesture = true;
      updateOverlayBound();

      if (state.pendingPlayOnGesture) {
        state.pendingPlayOnGesture = false;
        void safeNetflixSetPlayingViaBackground(true).then((res) => {
          state.lastCatchUpNote = res.ok
            ? null
            : `Play failed: ${res.error || "unknown"}`;
          updateOverlayBound();
        });
      }
    };

    document.addEventListener("pointerdown", markGesture, {
      capture: true,
      passive: true,
    });
    document.addEventListener("keydown", markGesture, { capture: true });

    ensureOverlayBound();
    updateOverlayBound();
    ensureVideoListenersBound();

    const cfg = await loadConfig();
    if (cfg.roomId) {
      try {
        connect(state, cfg, {
          ensureOverlay: ensureOverlayBound,
          updateOverlay: updateOverlayBound,
        });
      } catch {
        // ignore
      }
    }
  })();
}
