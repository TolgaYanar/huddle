type SeekMessage = {
  type: "HUDDLE_NETFLIX_SEEK";
  seconds: number;
};

type SetPlayingMessage = {
  type: "HUDDLE_NETFLIX_SET_PLAYING";
  playing: boolean;
};

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

chrome.runtime.onMessage.addListener(
  (msg: any, sender: any, sendResponse: any) => {
    const message = msg as SeekMessage | SetPlayingMessage;

    const tabId = sender?.tab?.id;
    if (!isFiniteNumber(tabId)) {
      sendResponse({ ok: false, error: "no_tab" });
      return true;
    }

    if (message?.type === "HUDDLE_NETFLIX_SEEK") {
      const seconds = (message as SeekMessage)?.seconds;
      if (!isFiniteNumber(seconds) || seconds < 0) {
        sendResponse({ ok: false, error: "invalid_seconds" });
        return true;
      }

      chrome.scripting
        .executeScript({
          target: { tabId },
          world: "MAIN",
          args: [seconds],
          func: (secs: number) => {
            try {
              const timeMs = Math.round(secs * 1000);

              const w = window as any;
              const api = w?.netflix?.appContext?.state?.playerApp?.getAPI?.();
              const videoPlayer = api?.videoPlayer;
              if (!videoPlayer) {
                return { ok: false, error: "no_videoPlayer" };
              }

              const ids: any[] = videoPlayer.getAllPlayerSessionIds?.() || [];
              const sessionId =
                ids.find((id) => String(id).includes("watch")) ||
                ids[0] ||
                null;
              if (!sessionId) {
                return { ok: false, error: "no_session" };
              }

              const player = videoPlayer.getVideoPlayerBySessionId(sessionId);
              if (!player || typeof player.seek !== "function") {
                return { ok: false, error: "no_player_seek" };
              }

              player.seek(timeMs);
              return { ok: true, sessionId, timeMs };
            } catch (e: any) {
              return { ok: false, error: String(e?.message || e) };
            }
          },
        })
        .then((results: any[]) => {
          const result = results?.[0]?.result;
          if (result?.ok === true) {
            sendResponse({ ok: true, result });
          } else {
            sendResponse({
              ok: false,
              error: result?.error || "seek_failed",
              result,
            });
          }
        })
        .catch((err: any) => {
          sendResponse({ ok: false, error: String(err?.message || err) });
        });

      return true;
    }

    if (message?.type === "HUDDLE_NETFLIX_SET_PLAYING") {
      const playing = (message as SetPlayingMessage)?.playing;
      if (typeof playing !== "boolean") {
        sendResponse({ ok: false, error: "invalid_playing" });
        return true;
      }

      chrome.scripting
        .executeScript({
          target: { tabId },
          world: "MAIN",
          args: [playing],
          func: (shouldPlay: boolean) => {
            try {
              const w = window as any;
              const api = w?.netflix?.appContext?.state?.playerApp?.getAPI?.();
              const videoPlayer = api?.videoPlayer;
              if (!videoPlayer) {
                return { ok: false, error: "no_videoPlayer" };
              }

              const ids: any[] = videoPlayer.getAllPlayerSessionIds?.() || [];
              const sessionId =
                ids.find((id) => String(id).includes("watch")) ||
                ids[0] ||
                null;
              if (!sessionId) {
                return { ok: false, error: "no_session" };
              }

              const player = videoPlayer.getVideoPlayerBySessionId(sessionId);
              if (!player) {
                return { ok: false, error: "no_player" };
              }

              const tryCall = (fn: any) => {
                try {
                  if (typeof fn !== "function") return false;
                  fn.call(player);
                  return true;
                } catch {
                  return false;
                }
              };

              const clickFallback = () => {
                try {
                  // Netflix control buttons can vary by UI; try common selectors.
                  const playSel =
                    '[data-uia="control-play-pause-play"], [aria-label="Play"], button[aria-label="Play"]';
                  const pauseSel =
                    '[data-uia="control-play-pause-pause"], [aria-label="Pause"], button[aria-label="Pause"]';
                  const el = document.querySelector(
                    shouldPlay ? playSel : pauseSel
                  ) as HTMLElement | null;
                  if (el) {
                    el.click();
                    return true;
                  }
                } catch {
                  // ignore
                }
                return false;
              };

              if (shouldPlay) {
                const ok =
                  tryCall(player.play) ||
                  tryCall(player.resume) ||
                  tryCall((player as any).playbackPlay) ||
                  tryCall((player as any).startPlayback) ||
                  clickFallback();
                return ok
                  ? { ok: true, sessionId, action: "play" }
                  : { ok: false, error: "no_player_play" };
              }

              const ok =
                tryCall(player.pause) ||
                tryCall((player as any).pausePlayback) ||
                tryCall((player as any).stopPlayback) ||
                clickFallback();
              return ok
                ? { ok: true, sessionId, action: "pause" }
                : { ok: false, error: "no_player_pause" };
            } catch (e: any) {
              return { ok: false, error: String(e?.message || e) };
            }
          },
        })
        .then((results: any[]) => {
          const result = results?.[0]?.result;
          if (result?.ok === true) {
            sendResponse({ ok: true, result });
          } else {
            sendResponse({
              ok: false,
              error: result?.error || "set_playing_failed",
              result,
            });
          }
        })
        .catch((err: any) => {
          sendResponse({ ok: false, error: String(err?.message || err) });
        });

      return true;
    }

    return false;
  }
);
