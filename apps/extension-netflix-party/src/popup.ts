type ExtensionConfig = {
  serverUrl: string;
  roomId: string;
};

// Server URL is hardcoded — not user-configurable. The Chrome Web Store
// listing distributes a single build per release; running against a local
// dev server requires a sideloaded unpacked extension.
const FIXED_SERVER_URL = "https://api.wehuddle.tv";

const STATUS_POLL_MS = 2000;

type StatusState = "idle" | "connecting" | "connected" | "error";

function qs<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

const serverUrlEl = qs<HTMLSpanElement>("serverUrl");
const versionEl = qs<HTMLSpanElement>("version");
const roomIdInput = qs<HTMLInputElement>("roomId");
const statusPillEl = qs<HTMLSpanElement>("statusPill");
const statusEl = qs<HTMLSpanElement>("status");
const connectBtn = qs<HTMLButtonElement>("connect");
const disconnectBtn = qs<HTMLButtonElement>("disconnect");
const hintEl = qs<HTMLParagraphElement>("hint");

/**
 * Extract a room ID from either a bare ID ("netflix-night") or any wehuddle
 * URL form ("https://wehuddle.tv/r/netflix-night", "wehuddle.tv/r/x?foo=bar",
 * etc.). Mirrors the same logic the website's home page uses so the popup
 * accepts whatever a user happens to copy.
 */
function parseRoomId(input: string): string {
  const raw = input.trim();
  if (!raw) return "";

  // If it looks like a URL, pull the segment after /r/
  const match = raw.match(/\/r\/([^/?#]+)/i);
  if (match?.[1]) {
    return decodeURIComponent(match[1]).trim();
  }

  // Otherwise treat the input as a bare room ID.
  return raw;
}

async function getActiveTabId(): Promise<number | null> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs?.[0];
  return typeof tab?.id === "number" ? tab.id : null;
}

async function isActiveTabNetflixWatch(): Promise<boolean> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tabs?.[0]?.url ?? "";
  return /^https:\/\/www\.netflix\.com\/watch\//i.test(url);
}

async function sendToActiveTab(message: unknown): Promise<unknown> {
  const tabId = await getActiveTabId();
  if (tabId === null) throw new Error("No active tab");
  return chrome.tabs.sendMessage(tabId, message);
}

function setStatus(text: string, state: StatusState): void {
  statusEl.textContent = text;
  statusPillEl.dataset.state = state;
}

async function loadConfig(): Promise<ExtensionConfig> {
  const stored = await chrome.storage.local.get(["huddle_roomId"]);
  return {
    serverUrl: FIXED_SERVER_URL,
    roomId: (stored?.huddle_roomId as string) || "",
  };
}

async function saveConfig(cfg: ExtensionConfig): Promise<void> {
  await chrome.storage.local.set({ huddle_roomId: cfg.roomId });
}

let lastPollAt = 0;
let pollInFlight = false;

/**
 * Poll the content script for its current connection state. Updates the
 * status pill + button-enabled states. Safe to call repeatedly — guarded by
 * pollInFlight so overlapping calls collapse.
 */
async function refreshStatus(): Promise<void> {
  if (pollInFlight) return;
  pollInFlight = true;
  try {
    if (!(await isActiveTabNetflixWatch())) {
      setStatus("Open a Netflix watch page", "idle");
      connectBtn.disabled = true;
      disconnectBtn.disabled = true;
      hintEl.style.display = "block";
      return;
    }

    connectBtn.disabled = false;

    try {
      const resp = (await sendToActiveTab({ type: "HUDDLE_GET_STATUS" })) as
        | { connected?: boolean; roomId?: string }
        | undefined;
      if (resp?.connected) {
        setStatus(`Live · ${resp.roomId ?? ""}`, "connected");
        disconnectBtn.disabled = false;
        hintEl.style.display = "none";
      } else {
        setStatus("Not connected", "idle");
        disconnectBtn.disabled = true;
        hintEl.style.display = "block";
      }
    } catch {
      // sendMessage throws if the content script hasn't loaded — usually
      // because the Netflix page hasn't finished loading or this isn't a
      // /watch URL after all.
      setStatus("Waiting for Netflix to finish loading…", "connecting");
      connectBtn.disabled = true;
      disconnectBtn.disabled = true;
    }
  } finally {
    pollInFlight = false;
    lastPollAt = Date.now();
  }
}

connectBtn.addEventListener("click", async () => {
  const roomId = parseRoomId(roomIdInput.value);
  if (!roomId) {
    setStatus("Room ID required", "error");
    return;
  }

  // Normalize the visible input back to the extracted ID so the user can
  // see what we'll actually use.
  if (roomIdInput.value !== roomId) roomIdInput.value = roomId;

  const cfg: ExtensionConfig = { serverUrl: FIXED_SERVER_URL, roomId };
  await saveConfig(cfg);

  setStatus(`Connecting to ${roomId}…`, "connecting");

  try {
    await sendToActiveTab({ type: "HUDDLE_CONNECT", ...cfg });
    // Poll right away — the content script flips connected=true once the
    // socket handshake finishes.
    setTimeout(refreshStatus, 600);
  } catch {
    setStatus("Open a Netflix watch page first", "error");
  }
});

disconnectBtn.addEventListener("click", async () => {
  try {
    await sendToActiveTab({ type: "HUDDLE_DISCONNECT" });
    setStatus("Disconnected", "idle");
    disconnectBtn.disabled = true;
  } catch {
    setStatus("Not connected", "idle");
  }
});

// Pressing Enter in the input is equivalent to clicking Connect.
roomIdInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    connectBtn.click();
  }
});

// Live status polling while popup is open. Popup closes => script unloads,
// so no cleanup needed.
const pollHandle = setInterval(() => {
  // Skip if a poll already happened recently (e.g. just after Connect).
  if (Date.now() - lastPollAt < STATUS_POLL_MS - 200) return;
  void refreshStatus();
}, STATUS_POLL_MS);
window.addEventListener("unload", () => clearInterval(pollHandle));

// Initial render.
(async () => {
  const manifest = chrome.runtime.getManifest();
  versionEl.textContent = `v${manifest.version}`;
  serverUrlEl.textContent = FIXED_SERVER_URL.replace(/^https?:\/\//, "");

  const cfg = await loadConfig();
  roomIdInput.value = cfg.roomId;
  await refreshStatus();
})();
