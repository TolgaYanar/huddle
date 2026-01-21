/**
 * Extract Netflix watch ID from URL
 */
export function extractNetflixWatchId(url: string): string | null {
  const patterns = [/netflix\.com\/watch\/(\d+)/, /netflix\.com\/title\/(\d+)/];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

/**
 * Format seconds to time string (H:MM:SS or M:SS)
 */
export function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Parse time string to seconds
 */
export function parseTime(timeStr: string): number {
  const parts = timeStr.split(":").map(Number);

  // Ensure all parts are valid numbers
  const [first, second, third] = parts;

  if (
    parts.length === 3 &&
    first !== undefined &&
    second !== undefined &&
    third !== undefined
  ) {
    // H:MM:SS
    if (!isNaN(first) && !isNaN(second) && !isNaN(third)) {
      return first * 3600 + second * 60 + third;
    }
  } else if (
    parts.length === 2 &&
    first !== undefined &&
    second !== undefined
  ) {
    // M:SS
    if (!isNaN(first) && !isNaN(second)) {
      return first * 60 + second;
    }
  } else if (parts.length === 1 && first !== undefined && !isNaN(first)) {
    // Just seconds
    return first;
  }

  return 0;
}
