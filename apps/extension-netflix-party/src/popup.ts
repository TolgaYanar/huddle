type ExtensionConfig = {
  serverUrl: string;
  roomId: string;
};

// Shape of the response from the content script's HUDDLE_GET_STATUS handler.
type StatusResponse = {
  connected: boolean;
  roomId: string | null;
  currentUrl?: string;
  videoTitle?: string | null;
  videoEpisode?: string | null;
  videoPosterUrl?: string | null;
  isPlaying?: boolean | null;
  currentTime?: number | null;
  duration?: number | null;
  members?: Array<{ socketId: string; username: string | null }>;
  hostId?: string | null;
  localSenderId?: string | null;
  roomVideoUrl?: string | null;
  roomIsPlaying?: boolean | null;
  note?: string | null;
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

// Refs
const serverUrlEl = qs<HTMLSpanElement>("serverUrl");
const versionEl = qs<HTMLSpanElement>("version");
const roomIdInput = qs<HTMLInputElement>("roomId");
const statusPillEl = qs<HTMLSpanElement>("statusPill");
const statusEl = qs<HTMLSpanElement>("status");
const connectBtn = qs<HTMLButtonElement>("connect");
const disconnectBtn = qs<HTMLButtonElement>("disconnect");
const hintEl = qs<HTMLParagraphElement>("hint");

const emptyOffNetflix = qs<HTMLDivElement>("emptyOffNetflix");
const nowPlaying = qs<HTMLDivElement>("nowPlaying");
const posterWrap = qs<HTMLDivElement>("posterWrap");
const posterEl = qs<HTMLImageElement>("poster");
const videoTitleEl = qs<HTMLDivElement>("videoTitle");
const videoEpisodeEl = qs<HTMLDivElement>("videoEpisode");
const videoStatusEl = qs<HTMLDivElement>("videoStatus");

const membersEl = qs<HTMLDivElement>("members");
const membersAvatarsEl = qs<HTMLDivElement>("membersAvatars");
const membersTextEl = qs<HTMLDivElement>("membersText");

const inviteLinkEl = qs<HTMLDivElement>("inviteLink");
const inviteLinkText = qs<HTMLElement>("inviteLinkText");
const copyInviteBtn = qs<HTMLButtonElement>("copyInviteBtn");

const noteEl = qs<HTMLDivElement>("note");
const onboardingStepsEl = qs<HTMLDivElement>("onboardingSteps");

// Pre-built SVG markup for the play/pause icons in the "now playing" status
// line. Kept here rather than in HTML so popup.ts can swap them based on
// playback state without dom-rewriting.
const PLAY_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
const PAUSE_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';

/**
 * Extract a room ID from either a bare ID or any wehuddle URL form.
 * Mirrors the same logic the website's home page uses.
 */
function parseRoomId(input: string): string {
  const raw = input.trim();
  if (!raw) return "";
  const match = raw.match(/\/r\/([^/?#]+)/i);
  if (match?.[1]) return decodeURIComponent(match[1]).trim();
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

function formatTime(seconds: number | null | undefined): string {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) {
    return "—:—";
  }
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

function initialOf(username: string | null | undefined): string {
  if (!username) return "?";
  const trimmed = username.trim();
  if (!trimmed) return "?";
  return trimmed.slice(0, 1).toUpperCase();
}

/**
 * Render the "Now playing" card from a content-script status response.
 * Falls back gracefully if Netflix's DOM didn't yield a title or poster
 * (sometimes happens during first-paint).
 */
function renderNowPlaying(status: StatusResponse): void {
  const hasTitle = !!status.videoTitle;
  const hasPoster = !!status.videoPosterUrl;

  if (!hasTitle && !hasPoster && !status.currentUrl) {
    nowPlaying.hidden = true;
    return;
  }
  nowPlaying.hidden = false;

  // Poster: real image if Netflix exposed one, shimmering skeleton while we
  // wait, placeholder emoji as the final fallback.
  if (hasPoster) {
    posterEl.src = status.videoPosterUrl!;
    posterEl.alt = status.videoTitle ?? "Poster";
    posterEl.style.display = "";
    posterWrap.classList.remove("skeleton", "placeholder");
  } else if (hasTitle) {
    // We have a title but no poster — show emoji placeholder rather than
    // leaving the box visually empty.
    posterEl.removeAttribute("src");
    posterEl.alt = "";
    posterEl.style.display = "none";
    posterWrap.classList.remove("skeleton");
    posterWrap.classList.add("placeholder");
  } else {
    // No data yet — shimmering skeleton until Netflix DOM yields metadata.
    posterEl.removeAttribute("src");
    posterEl.style.display = "none";
    posterWrap.classList.remove("placeholder");
    posterWrap.classList.add("skeleton");
  }

  videoTitleEl.textContent =
    status.videoTitle ??
    (status.currentUrl
      ? `/watch/${status.currentUrl.match(/\/watch\/(\d+)/)?.[1] ?? "—"}`
      : "—");

  if (status.videoEpisode) {
    videoEpisodeEl.textContent = status.videoEpisode;
    videoEpisodeEl.hidden = false;
  } else {
    videoEpisodeEl.hidden = true;
  }

  // Playback line with SVG icon + tabular-num time.
  const time = formatTime(status.currentTime);
  const dur = formatTime(status.duration);
  if (status.isPlaying === true) {
    videoStatusEl.dataset.playing = "true";
    videoStatusEl.innerHTML = `${PLAY_ICON}<span>Playing${time !== "—:—" ? ` · ${time}${dur !== "—:—" ? ` / ${dur}` : ""}` : ""}</span>`;
  } else if (status.isPlaying === false) {
    videoStatusEl.dataset.playing = "false";
    videoStatusEl.innerHTML = `${PAUSE_ICON}<span>Paused${time !== "—:—" ? ` · ${time}${dur !== "—:—" ? ` / ${dur}` : ""}` : ""}</span>`;
  } else {
    videoStatusEl.removeAttribute("data-playing");
    videoStatusEl.innerHTML = "";
  }
}

/**
 * Render the members card. Shows up to 4 avatars + an "(+N more)" tail.
 */
function renderMembers(status: StatusResponse): void {
  const members = status.members ?? [];
  if (!status.connected || members.length === 0) {
    membersEl.hidden = true;
    return;
  }
  membersEl.hidden = false;
  membersAvatarsEl.innerHTML = "";

  const MAX_AVATARS = 4;
  const shown = members.slice(0, MAX_AVATARS);
  for (const m of shown) {
    const avatar = document.createElement("span");
    avatar.className = "avatar";
    const isHost = !!status.hostId && m.socketId === status.hostId;
    const isYou = !!status.localSenderId && m.socketId === status.localSenderId;
    if (isHost) avatar.classList.add("host");
    if (isYou) avatar.classList.add("you");
    const label = m.username ?? m.socketId.slice(0, 6);
    avatar.title = isYou
      ? `${label} (you${isHost ? ", host" : ""})`
      : isHost
        ? `${label} (host)`
        : label;
    avatar.textContent = initialOf(m.username ?? m.socketId);
    membersAvatarsEl.appendChild(avatar);
  }

  const total = members.length;
  const overflow = total - MAX_AVATARS;
  if (overflow > 0) {
    const more = document.createElement("span");
    more.className = "more";
    more.textContent = `+${overflow}`;
    more.title = `${overflow} more ${overflow === 1 ? "person" : "people"} in the room`;
    membersAvatarsEl.appendChild(more);
  }

  const personWord = total === 1 ? "person" : "people";
  // Role detail on a second line for legibility.
  let role = "";
  if (status.hostId === status.localSenderId) role = "You&rsquo;re the host";
  else if (
    status.localSenderId &&
    members.some((m) => m.socketId === status.localSenderId)
  )
    role = "You&rsquo;re in the room";
  membersTextEl.innerHTML =
    `<strong>${total}</strong> ${personWord} watching together` +
    (role ? `<span class="role">${role}</span>` : "");
}

function renderInviteLink(status: StatusResponse): void {
  if (!status.connected || !status.roomId) {
    inviteLinkEl.hidden = true;
    return;
  }
  inviteLinkEl.hidden = false;
  inviteLinkText.textContent = `wehuddle.tv/r/${status.roomId}`;
  // Reset copy button state when the room id changes between polls.
  copyInviteBtn.textContent = "Copy";
  copyInviteBtn.classList.remove("copied");
}

function renderOnboarding(status: StatusResponse | null, onNetflix: boolean): void {
  // Show the numbered "How to start a watch party" card whenever the user
  // is on Netflix but isn't yet connected. Skip it once a connection is
  // established — the now-playing + members cards take that real estate.
  const isConnected = !!status?.connected;
  onboardingStepsEl.hidden = !(onNetflix && !isConnected);
}

function renderNote(status: StatusResponse): void {
  if (status.note) {
    noteEl.hidden = false;
    noteEl.textContent = status.note;
  } else {
    noteEl.hidden = true;
  }
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

async function refreshStatus(): Promise<void> {
  if (pollInFlight) return;
  pollInFlight = true;
  try {
    const onNetflix = await isActiveTabNetflixWatch();
    if (!onNetflix) {
      setStatus("Open a Netflix watch page", "idle");
      connectBtn.disabled = true;
      disconnectBtn.disabled = true;
      hintEl.hidden = true;
      emptyOffNetflix.hidden = false;
      nowPlaying.hidden = true;
      membersEl.hidden = true;
      inviteLinkEl.hidden = true;
      noteEl.hidden = true;
      onboardingStepsEl.hidden = true;
      return;
    }

    emptyOffNetflix.hidden = true;
    connectBtn.disabled = false;

    let resp: StatusResponse | undefined;
    try {
      resp = (await sendToActiveTab({ type: "HUDDLE_GET_STATUS" })) as
        | StatusResponse
        | undefined;
    } catch {
      // sendMessage throws when the content script hasn't initialized yet
      // (Netflix page still loading, or extension just reloaded).
      setStatus("Waiting for Netflix to finish loading…", "connecting");
      connectBtn.disabled = true;
      disconnectBtn.disabled = true;
      nowPlaying.hidden = true;
      membersEl.hidden = true;
      inviteLinkEl.hidden = true;
      hintEl.hidden = false;
      noteEl.hidden = true;
      onboardingStepsEl.hidden = true;
      return;
    }

    if (!resp) {
      setStatus("Not connected", "idle");
      disconnectBtn.disabled = true;
      hintEl.hidden = false;
      nowPlaying.hidden = true;
      membersEl.hidden = true;
      inviteLinkEl.hidden = true;
      noteEl.hidden = true;
      renderOnboarding(null, onNetflix);
      return;
    }

    if (resp.connected) {
      setStatus(`Live · ${resp.roomId ?? ""}`, "connected");
      disconnectBtn.disabled = false;
      hintEl.hidden = true;
    } else {
      setStatus("Not connected", "idle");
      disconnectBtn.disabled = true;
      hintEl.hidden = false;
    }

    renderNowPlaying(resp);
    renderMembers(resp);
    renderInviteLink(resp);
    renderNote(resp);
    renderOnboarding(resp, onNetflix);
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
  if (roomIdInput.value !== roomId) roomIdInput.value = roomId;

  const cfg: ExtensionConfig = { serverUrl: FIXED_SERVER_URL, roomId };
  await saveConfig(cfg);
  setStatus(`Connecting to ${roomId}…`, "connecting");
  try {
    await sendToActiveTab({ type: "HUDDLE_CONNECT", ...cfg });
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

copyInviteBtn.addEventListener("click", async () => {
  const url = inviteLinkText.textContent ?? "";
  if (!url) return;
  try {
    await navigator.clipboard.writeText(
      url.startsWith("http") ? url : `https://${url}`,
    );
    copyInviteBtn.textContent = "Copied!";
    copyInviteBtn.classList.add("copied");
    setTimeout(() => {
      copyInviteBtn.textContent = "Copy";
      copyInviteBtn.classList.remove("copied");
    }, 1600);
  } catch {
    copyInviteBtn.textContent = "Failed";
    setTimeout(() => {
      copyInviteBtn.textContent = "Copy";
    }, 1600);
  }
});

roomIdInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    connectBtn.click();
  }
});

const pollHandle = setInterval(() => {
  if (Date.now() - lastPollAt < STATUS_POLL_MS - 200) return;
  void refreshStatus();
}, STATUS_POLL_MS);
window.addEventListener("unload", () => clearInterval(pollHandle));

(async () => {
  const manifest = chrome.runtime.getManifest();
  versionEl.textContent = `v${manifest.version}`;
  serverUrlEl.textContent = FIXED_SERVER_URL.replace(/^https?:\/\//, "");

  const cfg = await loadConfig();
  roomIdInput.value = cfg.roomId;
  await refreshStatus();
})();
