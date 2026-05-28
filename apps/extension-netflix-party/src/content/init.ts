import type { ExtensionConfig } from "./types";
import { FIXED_SERVER_URL, STORAGE_KEYS } from "./constants";
import { createInitialState } from "./state";
import { ensureOverlay, updateOverlay } from "./overlay";
import { loadConfig } from "./config";
import { ensureVideoListeners } from "./playerSync";
import { extractNetflixMetadata } from "./metadata";
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
        // Snapshot of everything the popup needs to draw its UI: room
        // membership, what video is currently playing in the room, the
        // user's video metadata for visual context, and playback state.
        // Kept defensive — every field is best-effort and falls back to
        // null/undefined so a popup that hits an older content script
        // (e.g. while reloading the unpacked extension) doesn't crash.
        let video: HTMLVideoElement | null = null;
        try {
          video = state.listenersAttachedTo ?? document.querySelector("video");
        } catch {
          video = null;
        }

        const metadata = (() => {
          try {
            return extractNetflixMetadata();
          } catch {
            return { title: null, posterUrl: null, episode: null };
          }
        })();

        sendResponse({
          connected: Boolean(state.socket && state.socket.connected),
          roomId: state.currentRoomId,
          // Current page URL (lets popup show "/watch/<id>" badge).
          currentUrl: location.href,
          // Netflix-side metadata for visual context.
          videoTitle: metadata.title,
          videoEpisode: metadata.episode,
          videoPosterUrl: metadata.posterUrl,
          // Current video state we know about locally.
          isPlaying: video ? !video.paused : null,
          currentTime: video?.currentTime ?? null,
          duration: video?.duration ?? null,
          // Room snapshot derived from the most recent room_users event.
          members: state.roomMembers,
          hostId: state.hostId,
          // Are we the host? (Used to label members in the popup.)
          localSenderId: state.localSenderId,
          // Last known room playback state — populated by either
          // room_state or receive_sync events.
          roomVideoUrl: state.pendingRoomState?.videoUrl ?? null,
          roomIsPlaying: state.pendingRoomState?.isPlaying ?? null,
          // Recent error / hint surface ("E100", "Click anywhere to
          // resume…", etc.).
          note: state.lastCatchUpNote,
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
