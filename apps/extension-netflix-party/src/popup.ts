type ExtensionConfig = {
  serverUrl: string;
  roomId: string;
};

// Hardcoded server URL: not user-configurable.
// TODO: set this to your production server before publishing.
const FIXED_SERVER_URL = "https://api.wehuddle.tv";

function qs<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

const serverUrlEl = qs<HTMLDivElement>("serverUrl");
const roomIdInput = qs<HTMLInputElement>("roomId");
const statusEl = qs<HTMLDivElement>("status");
const connectBtn = qs<HTMLButtonElement>("connect");
const disconnectBtn = qs<HTMLButtonElement>("disconnect");

async function getActiveTabId(): Promise<number | null> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs?.[0];
  return typeof tab?.id === "number" ? tab.id : null;
}

async function sendToActiveTab(message: any): Promise<void> {
  const tabId = await getActiveTabId();
  if (!tabId) throw new Error("No active tab");
  await chrome.tabs.sendMessage(tabId, message);
}

function setStatus(text: string) {
  statusEl.textContent = text;
}

async function loadConfig(): Promise<ExtensionConfig> {
  const stored = await chrome.storage.local.get(["huddle_roomId"]);
  return {
    serverUrl: FIXED_SERVER_URL,
    roomId: (stored?.huddle_roomId as string) || "",
  };
}

async function saveConfig(cfg: ExtensionConfig): Promise<void> {
  await chrome.storage.local.set({
    huddle_roomId: cfg.roomId,
  });
}

async function refreshStatusFromTab(): Promise<void> {
  try {
    const tabId = await getActiveTabId();
    if (!tabId) {
      setStatus("No active tab");
      return;
    }

    const resp = await chrome.tabs.sendMessage(tabId, {
      type: "HUDDLE_GET_STATUS",
    });
    if (resp?.connected) {
      setStatus(`Connected: ${resp.roomId || ""}`);
    } else {
      setStatus("Not connected");
    }
  } catch {
    setStatus("Open a Netflix watch page");
  }
}

connectBtn.addEventListener("click", async () => {
  const serverUrl = FIXED_SERVER_URL;
  const roomId = roomIdInput.value.trim();

  if (!roomId) {
    setStatus("Room ID is required");
    return;
  }

  const cfg: ExtensionConfig = { serverUrl, roomId };
  await saveConfig(cfg);

  try {
    await sendToActiveTab({ type: "HUDDLE_CONNECT", ...cfg });
    setStatus(`Connecting: ${roomId}`);
  } catch {
    setStatus("Open a Netflix watch page");
  }
});

disconnectBtn.addEventListener("click", async () => {
  try {
    await sendToActiveTab({ type: "HUDDLE_DISCONNECT" });
    setStatus("Disconnected");
  } catch {
    setStatus("Not connected");
  }
});

(async () => {
  const cfg = await loadConfig();
  serverUrlEl.textContent = cfg.serverUrl;
  roomIdInput.value = cfg.roomId;
  await refreshStatusFromTab();
})();
