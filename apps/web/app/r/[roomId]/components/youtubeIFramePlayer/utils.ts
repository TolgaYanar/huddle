export function toVolume100(volume01: number) {
  return Math.max(0, Math.min(100, Math.round(volume01 * 100)));
}

export function ytErrorMessage(code: unknown): string {
  // https://developers.google.com/youtube/iframe_api_reference#onError
  if (code === 2) return "YouTube error: invalid video parameters.";
  if (code === 5) return "YouTube error: HTML5 player error.";
  if (code === 100) return "YouTube error: video not found or removed.";
  if (code === 101 || code === 150)
    return "YouTube error: embedding is disabled for this video.";
  return "YouTube error: failed to load video.";
}
