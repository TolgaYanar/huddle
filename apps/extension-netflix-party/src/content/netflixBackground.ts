export async function safeNetflixSeekViaBackground(
  seconds: number,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const resp = await chrome.runtime.sendMessage({
      type: "HUDDLE_NETFLIX_SEEK",
      seconds,
    });
    if (resp?.ok === true) return { ok: true };
    return {
      ok: false,
      error: resp?.error || resp?.result?.error || "seek_failed",
    };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }
}

export async function safeNetflixSetPlayingViaBackground(
  playing: boolean,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const resp = await chrome.runtime.sendMessage({
      type: "HUDDLE_NETFLIX_SET_PLAYING",
      playing,
    });
    if (resp?.ok === true) return { ok: true };
    return {
      ok: false,
      error: resp?.error || resp?.result?.error || "set_playing_failed",
    };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }
}
