export const STORAGE_KEYS = {
  roomId: "huddle_roomId",
};

// Hardcoded server URL: not user-configurable.
// TODO: set this to your production server before publishing.
export const FIXED_SERVER_URL = "https://api.wehuddle.tv";

export const LEGACY_SERVER_URL_KEY = "huddle_serverUrl";

// Keep console output minimal; the overlay UI should be the primary feedback.
export const DEBUG_LOGS = false;

// Always-on behavior for the extension per request.
export const followEnabled = true;
export const seekEnabled = true;
export const autoPlayPauseEnabled = true;
