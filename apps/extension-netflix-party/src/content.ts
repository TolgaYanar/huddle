import { initContentScript } from "./content/init";

initContentScript();
import { io, Socket } from "socket.io-client";

type ExtensionConfig = {
  serverUrl: string;
  roomId: string;
};

type RoomState = {
  roomId: string;
  serverNow?: number;
  videoUrl?: string;
  timestamp?: number;
  updatedAt?: number;
  isPlaying?: boolean;
  playbackSpeed?: number;
  volume?: number;
  isMuted?: boolean;
  rev?: number;
};

const STORAGE_KEYS = {
  roomId: "huddle_roomId",
};

// Hardcoded server URL: not user-configurable.
// TODO: set this to your production server before publishing.
const FIXED_SERVER_URL = "https://api.wehuddle.tv";
const LEGACY_SERVER_URL_KEY = "huddle_serverUrl";

// Keep console output minimal; the overlay UI should be the primary feedback.
const DEBUG_LOGS = false;

let socket: Socket | null = null;
let currentRoomId: string | null = null;
let isApplyingRemote = false;
let lastAppliedRev = 0;

let localSenderId: string | null = null;
let lastConnectionError: string | null = null;

// Always-on behavior for the extension per request.
const followEnabled = true;
const seekEnabled = true;
const autoPlayPauseEnabled = true;

let lastWatchIdMismatch: { expected: string; actual: string } | null = null;

let hasUserGesture = false;
let lastUserGestureAt = 0;
let lastRemoteApplyAt = 0;
let lastRemoteAction: string | null = null;
let lastRemoteTimestamp: number | null = null;

let playPausePollTimer: number | null = null;
let lastLocalPaused: boolean | null = null;

let pendingRoomState: RoomState | null = null;
let pendingDriftSeconds: number | null = null;

let pendingPlayOnGesture = false;

let lastCatchUpNote: string | null = null;

type ChatMessage = {
  id?: string;
  roomId: string;
  senderId: string;
  senderUsername?: string | null;
  text: string;
  createdAt?: string | Date;
};

let chatMessages: ChatMessage[] = [];

let lastRenderedChatSignature = "";

let overlayRoot: HTMLDivElement | null = null;
let overlayShadow: ShadowRoot | null = null;
let overlayEls: {
  status: HTMLSpanElement;
  room: HTMLSpanElement;
  drift: HTMLSpanElement;
  hint: HTMLDivElement;
  collapse: HTMLButtonElement;
  panel: HTMLDivElement;
  chatList: HTMLDivElement;
  chatInput: HTMLTextAreaElement;
  chatSend: HTMLButtonElement;
} | null = null;

let listenersAttachedTo: HTMLVideoElement | null = null;

function debugLog(...args: any[]) {
  if (!DEBUG_LOGS) return;
  // eslint-disable-next-line no-console
  console.log("[HuddleNetflix]", ...args);
}

function getVideoCandidates(): HTMLVideoElement[] {
  return Array.from(document.querySelectorAll("video")).filter(
    (v): v is HTMLVideoElement => v instanceof HTMLVideoElement,
  );
}

function isVisible(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width < 10 || rect.height < 10) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  if (Number.parseFloat(style.opacity || "1") < 0.05) return false;
  return true;
}

function getBestVideo(): HTMLVideoElement | null {
  const vids = getVideoCandidates();
  if (vids.length === 0) return null;

  let best: HTMLVideoElement | null = null;
  let bestScore = -1;

  for (const v of vids) {
    if (!isVisible(v)) continue;
    const rect = v.getBoundingClientRect();
    const area = rect.width * rect.height;
    const readyBonus = v.readyState >= 2 ? 1_000_000 : 0;
    const score = area + readyBonus;
    if (score > bestScore) {
      bestScore = score;
      best = v;
    }
  }

  return best || vids[0];
}

function getNetflixWatchIdFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/^\/watch\/(\d+)/);
    return m?.[1] ? m[1] : null;
  } catch {
    const m = String(url).match(/\/watch\/(\d+)/);
    return m?.[1] ? m[1] : null;
  }
}

function getLocalWatchId(): string | null {
  const m = location.pathname.match(/^\/watch\/(\d+)/);
  return m?.[1] ? m[1] : null;
}

function isLikelyEchoEvent(action: string, timestamp: number): boolean {
  if (!lastRemoteAction || !lastRemoteTimestamp) return false;
  const now = Date.now();
  // If we just applied a remote action, and we see a matching video event shortly after, it's likely an echo.
  // Use a shorter window (1.5s) to avoid blocking real user actions.
  if (now - lastRemoteApplyAt > 1500) return false;
  if (lastRemoteAction !== action) return false;
  return Math.abs(timestamp - lastRemoteTimestamp) < 1.5;
}

function suppressLocalEmitsFor(ms: number) {
  // No longer using a blanket suppression; instead we filter by echo detection.
}

function computeDesiredTimestampNow(state: RoomState): number | null {
  const base =
    typeof state.timestamp === "number" && Number.isFinite(state.timestamp)
      ? state.timestamp
      : null;
  if (base === null) return null;

  const serverNow =
    typeof state.serverNow === "number" && Number.isFinite(state.serverNow)
      ? state.serverNow
      : null;
  const isPlaying = state.isPlaying === true;
  if (!isPlaying || serverNow === null) return base;

  const speed =
    typeof state.playbackSpeed === "number" &&
    Number.isFinite(state.playbackSpeed)
      ? state.playbackSpeed
      : 1;
  const clientNow = Date.now();
  const deltaSeconds = Math.max(0, (clientNow - serverNow) / 1000);
  return base + deltaSeconds * speed;
}

async function loadConfig(): Promise<ExtensionConfig> {
  const stored = await chrome.storage.local.get([STORAGE_KEYS.roomId]);
  return {
    serverUrl: FIXED_SERVER_URL,
    roomId: (stored?.[STORAGE_KEYS.roomId] as string) || "",
  };
}

function isConnected() {
  return Boolean(socket && socket.connected);
}

function shouldEmitLocalSync() {
  return isConnected() && Boolean(currentRoomId);
}

function stopPlayPausePoll() {
  if (playPausePollTimer !== null) {
    window.clearInterval(playPausePollTimer);
    playPausePollTimer = null;
  }
  lastLocalPaused = null;
}

function startPlayPausePoll() {
  if (playPausePollTimer !== null) return;

  playPausePollTimer = window.setInterval(() => {
    const v = getBestVideo();
    if (!v) return;

    const paused = Boolean(v.paused);
    if (lastLocalPaused === null) {
      lastLocalPaused = paused;
      return;
    }

    if (paused === lastLocalPaused) return;

    const action = paused ? "pause" : "play";
    const timestamp = Number.isFinite(v.currentTime)
      ? v.currentTime
      : undefined;

    // Always update our local snapshot so we don't emit later.
    lastLocalPaused = paused;

    // Don't broadcast changes that are the result of applying room_state.
    if (isApplyingRemote) return;
    if (!shouldEmitLocalSync()) return;
    if (typeof timestamp === "number" && isLikelyEchoEvent(action, timestamp))
      return;

    // For play, Netflix may require a user gesture on the *local* tab.
    if (action === "play" && !hasUserGesture) return;

    emitSync(action, timestamp);
  }, 500);
}

function formatChatTime(raw?: string | Date) {
  try {
    const d = raw instanceof Date ? raw : raw ? new Date(raw) : null;
    if (!d || Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function renderChat() {
  if (!overlayEls) return;
  const list = overlayEls.chatList;

  const last = chatMessages.length
    ? chatMessages[chatMessages.length - 1]
    : null;
  const signature = `${chatMessages.length}:${last?.id || ""}:${String(last?.createdAt || "")}`;
  if (signature === lastRenderedChatSignature) return;
  lastRenderedChatSignature = signature;

  const prevScrollTop = list.scrollTop;
  const prevScrollHeight = list.scrollHeight;
  const nearBottom =
    prevScrollHeight - (prevScrollTop + list.clientHeight) < 80;

  list.textContent = "";

  const recent = chatMessages.slice(-150);
  if (recent.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No messages yet.";
    list.appendChild(empty);
  } else {
    for (const m of recent) {
      const isMe = Boolean(localSenderId && m.senderId === localSenderId);
      const row = document.createElement("div");
      row.className = `msgRow ${isMe ? "me" : "other"}`;

      const bubble = document.createElement("div");
      bubble.className = "bubble";

      const meta = document.createElement("div");
      meta.className = "meta";

      const who = document.createElement("span");
      who.className = "who";
      who.textContent = isMe
        ? "You"
        : (m.senderUsername && String(m.senderUsername).trim()) ||
          String(m.senderId || "").slice(0, 6) ||
          "?";

      const when = document.createElement("span");
      when.className = "when";
      when.textContent = formatChatTime(m.createdAt);

      meta.appendChild(who);
      if (when.textContent) meta.appendChild(when);

      const body = document.createElement("div");
      body.className = "text";
      body.textContent = m.text;

      bubble.appendChild(meta);
      bubble.appendChild(body);
      row.appendChild(bubble);
      list.appendChild(row);
    }
  }

  // Keep user's scroll position unless they were already at the bottom.
  if (nearBottom) {
    list.scrollTop = list.scrollHeight;
  } else {
    const newScrollHeight = list.scrollHeight;
    list.scrollTop =
      prevScrollTop + Math.max(0, newScrollHeight - prevScrollHeight);
  }
}

function ensureOverlay() {
  if (overlayRoot && overlayShadow && overlayEls) return;

  // Avoid duplicating the overlay on HMR/reinjection.
  const existing = document.getElementById("huddle-netflix-overlay");
  if (existing && existing instanceof HTMLDivElement) {
    overlayRoot = existing;
    overlayShadow = overlayRoot.shadowRoot;
    // If we can't rehydrate easily, just return.
    if (!overlayShadow) return;
  } else {
    overlayRoot = document.createElement("div");
    overlayRoot.id = "huddle-netflix-overlay";
    overlayRoot.style.position = "fixed";
    overlayRoot.style.right = "16px";
    overlayRoot.style.bottom = "16px";
    overlayRoot.style.zIndex = "2147483647";
    overlayRoot.style.pointerEvents = "none";
    overlayShadow = overlayRoot.attachShadow({ mode: "open" });
    document.documentElement.appendChild(overlayRoot);
  }

  const css = `
    :host{ all: initial; }
    *{ box-sizing:border-box; font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; }
    .panel{ pointer-events:auto; width: 440px; height: calc(100vh - 32px); border-radius: 18px; background: linear-gradient(180deg, rgba(18,18,26,.92), rgba(12,12,18,.92)); border: 1px solid rgba(255,255,255,.14); color: #fff; overflow:hidden; backdrop-filter: blur(12px); display:flex; flex-direction:column; box-shadow: 0 20px 60px rgba(0,0,0,.55); min-height: 0; }
    .hdr{ display:flex; align-items:center; justify-content:space-between; padding: 12px 12px; background: rgba(255,255,255,.04); border-bottom: 1px solid rgba(255,255,255,.08); }
    .title{ display:flex; align-items:center; gap:10px; font-weight: 700; font-size: 13px; letter-spacing: .2px; }
    .dot{ width:10px; height:10px; border-radius:999px; background:#777; box-shadow: 0 0 0 3px rgba(255,255,255,.07) inset; }
    .dot.ok{ background:#4ade80; }
    .dot.bad{ background:#fb7185; }
    .btn{ all: unset; cursor:pointer; padding: 7px 10px; border-radius: 12px; font-size: 12px; border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.06); }
    .btn:hover{ background: rgba(255,255,255,.10); }
    .body{ padding: 10px 12px 8px 12px; display:flex; flex-direction:column; gap:8px; }
    .row{ display:flex; justify-content:space-between; gap:10px; font-size: 12px; opacity:.95; }
    .row b{ font-weight: 600; opacity: .9; }
    .val{ text-align:right; opacity:.9; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width: 170px; }
    .hint{ font-size: 11px; opacity:.7; line-height:1.35; }
    .chat{ flex: 1; display:flex; flex-direction:column; gap:10px; padding: 0 12px 12px 12px; min-height: 0; }
    .chatHdr{ display:flex; align-items:center; justify-content:space-between; gap:8px; padding-top: 2px; }
    .chatHdr .label{ font-size: 12px; font-weight: 700; opacity: .92; }
    .chatList{ flex: 1; min-height: 0; overflow:auto; padding: 12px; border-radius: 14px; border: 1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.22); display:flex; flex-direction:column; gap:10px; }
    .chatList::-webkit-scrollbar{ width: 10px; }
    .chatList::-webkit-scrollbar-thumb{ background: rgba(255,255,255,.14); border-radius: 999px; border: 2px solid rgba(0,0,0,.0); background-clip: padding-box; }
    .empty{ opacity: .6; font-size: 12px; padding: 10px; text-align:center; }
    .msgRow{ display:flex; }
    .msgRow.me{ justify-content:flex-end; }
    .bubble{ max-width: 86%; padding: 10px 10px; border-radius: 14px; border: 1px solid rgba(255,255,255,.10); background: rgba(255,255,255,.06); }
    .msgRow.me .bubble{ background: rgba(91,91,247,.22); border-color: rgba(91,91,247,.45); }
    .meta{ display:flex; align-items:baseline; justify-content:space-between; gap:10px; font-size: 11px; opacity:.78; margin-bottom: 6px; }
    .who{ font-weight: 750; opacity:.95; }
    .when{ opacity:.7; font-variant-numeric: tabular-nums; }
    .text{ font-size: 13px; line-height: 1.35; white-space:pre-wrap; word-break:break-word; }
    .chatBox{ display:flex; gap:8px; align-items:flex-end; }
    textarea{ width: 100%; min-height: 44px; max-height: 140px; resize: vertical; padding: 10px 10px; border-radius: 14px; border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.06); color:#fff; outline:none; }
    textarea:focus{ border-color: rgba(91,91,247,.75); box-shadow: 0 0 0 3px rgba(91,91,247,.18); }
    textarea::placeholder{ color: rgba(255,255,255,.55); }
    .send{ all: unset; cursor:pointer; padding: 10px 14px; border-radius: 14px; font-size: 12px; font-weight:750; border: 1px solid rgba(91,91,247,1); background: rgba(91,91,247,.92); }
    .send:hover{ filter: brightness(1.05); }
    .send.disabled{ opacity: .55; cursor: default; filter: none; }
    .collapsed .body, .collapsed .chat{ display:none; }
    .panel.collapsed{ height: auto; width: 260px; }
  `;

  overlayShadow!.innerHTML = `
    <style>${css}</style>
    <div class="panel" id="panel">
      <div class="hdr">
        <div class="title">
          <span class="dot" id="dot"></span>
          <span>Huddle</span>
        </div>
        <button class="btn" id="collapse" title="Collapse">Hide</button>
      </div>
      <div class="body">
        <div class="row"><b>Status</b><span class="val" id="status">…</span></div>
        <div class="row"><b>Room</b><span class="val" id="room">…</span></div>
        <div class="row"><b>Drift</b><span class="val" id="drift">—</span></div>
        <div class="hint" id="hint"></div>
      </div>
      <div class="chat">
        <div class="chatHdr"><div class="label">Chat</div></div>
        <div class="chatList" id="chatList"></div>
        <div class="chatBox">
          <textarea id="chatInput" placeholder="Message… (Enter to send, Shift+Enter for newline)"></textarea>
          <button class="send" id="chatSend">Send</button>
        </div>
      </div>
    </div>
  `;

  const panel = overlayShadow!.getElementById("panel") as HTMLDivElement;
  const status = overlayShadow!.getElementById("status") as HTMLSpanElement;
  const room = overlayShadow!.getElementById("room") as HTMLSpanElement;
  const drift = overlayShadow!.getElementById("drift") as HTMLSpanElement;
  const hint = overlayShadow!.getElementById("hint") as HTMLDivElement;
  const collapse = overlayShadow!.getElementById(
    "collapse",
  ) as HTMLButtonElement;
  const dot = overlayShadow!.getElementById("dot") as HTMLSpanElement;
  const chatList = overlayShadow!.getElementById("chatList") as HTMLDivElement;
  const chatInput = overlayShadow!.getElementById(
    "chatInput",
  ) as HTMLTextAreaElement;
  const chatSend = overlayShadow!.getElementById(
    "chatSend",
  ) as HTMLButtonElement;

  const syncSendButtonState = () => {
    const hasText = Boolean(String(chatInput.value || "").trim());
    chatSend.disabled = !hasText;
    chatSend.classList.toggle("disabled", !hasText);
  };

  const doSend = () => {
    const s = socket;
    const roomId = currentRoomId;
    if (!s || !roomId) return;
    const text = String(chatInput.value || "").trim();
    if (!text) return;
    s.emit("send_chat", { roomId, text });
    chatInput.value = "";
    syncSendButtonState();
  };

  chatSend.addEventListener("click", () => doSend());
  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      doSend();
    }
  });
  chatInput.addEventListener("input", () => syncSendButtonState());
  syncSendButtonState();

  collapse.addEventListener("click", () => {
    panel.classList.toggle("collapsed");
    collapse.textContent = panel.classList.contains("collapsed")
      ? "Show"
      : "Hide";
  });

  overlayEls = {
    status,
    room,
    drift,
    hint,
    collapse,
    panel,
    chatList,
    chatInput,
    chatSend,
  };

  // Keep dot as a closure-local element.
  (overlayShadow as any).__huddleDot = dot;
}

function updateOverlay() {
  if (!overlayShadow || !overlayEls) return;
  const dot = (overlayShadow as any).__huddleDot as HTMLSpanElement | undefined;

  const connected = isConnected();
  const roomId = currentRoomId || "(none)";

  overlayEls.status.textContent = connected ? "Connected" : "Disconnected";
  overlayEls.room.textContent = roomId;

  if (pendingDriftSeconds === null || !Number.isFinite(pendingDriftSeconds)) {
    overlayEls.drift.textContent = "—";
  } else {
    const d = pendingDriftSeconds;
    const sign = d > 0.05 ? "+" : d < -0.05 ? "-" : "";
    overlayEls.drift.textContent = `${sign}${Math.abs(d).toFixed(1)}s`;
  }

  if (dot) {
    dot.classList.remove("ok", "bad");
    dot.classList.add(connected ? "ok" : "bad");
  }

  if (!connected) {
    overlayEls.hint.textContent = lastConnectionError
      ? `Connection error: ${lastConnectionError}`
      : "Open the extension popup to connect to a room.";
  } else if (lastWatchIdMismatch) {
    overlayEls.hint.textContent = `This room is watching a different title (${lastWatchIdMismatch.expected}). Open /watch/${lastWatchIdMismatch.expected} first.`;
  } else if (!hasUserGesture) {
    overlayEls.hint.textContent =
      "Click anywhere on the page once to allow playback sync.";
  } else {
    overlayEls.hint.textContent = lastCatchUpNote
      ? lastCatchUpNote
      : "Playback sync + chat active.";
  }

  renderChat();
}

function normalizeServerUrl(serverUrl: string): string {
  return serverUrl.replace(/\/+$/, "");
}

function recordPendingRoomState(state: RoomState) {
  pendingRoomState = state;

  const v = getBestVideo();
  const t = computeDesiredTimestampNow(state);
  if (v && t !== null && Number.isFinite(v.currentTime)) {
    pendingDriftSeconds = v.currentTime - t;
  } else {
    pendingDriftSeconds = null;
  }
}

async function safeNetflixSeekViaBackground(
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

async function safeNetflixSetPlayingViaBackground(
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

function connect(cfg: ExtensionConfig) {
  const serverUrl = normalizeServerUrl(cfg.serverUrl);
  const roomId = cfg.roomId.trim();
  if (!roomId) throw new Error("roomId required");

  disconnect();

  currentRoomId = roomId;
  chatMessages = [];
  lastRenderedChatSignature = "";
  lastAppliedRev = 0;
  lastConnectionError = null;

  ensureOverlay();
  updateOverlay();

  socket = io(serverUrl, {
    transports: ["websocket", "polling"],
    autoConnect: true,
    withCredentials: true,
    path: "/socket.io/",
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    timeout: 20000,
  });

  socket.on("connect", () => {
    localSenderId = socket?.id || null;
    lastConnectionError = null;
    socket?.emit("join_room", { roomId });
    socket?.emit("request_room_state", roomId);
    socket?.emit("request_chat_history", roomId);
    startPlayPausePoll();
    updateOverlay();
  });

  socket.on("connect_error", (err: any) => {
    lastConnectionError = String(err?.message || err || "connect_error");
    debugLog("connect_error", lastConnectionError);
    updateOverlay();
  });

  socket.on("disconnect", (reason: string) => {
    debugLog("disconnected", reason);
    localSenderId = null;
    updateOverlay();
  });

  socket.on("room_state", (state: RoomState) => {
    if (!state || state.roomId !== currentRoomId) return;
    recordPendingRoomState(state);
    updateOverlay();
    if (followEnabled) applyRoomStateToVideo(state);
  });

  socket.on("chat_history", (payload: any) => {
    if (!payload || payload.roomId !== currentRoomId) return;
    const msgs = Array.isArray(payload.messages) ? payload.messages : [];
    chatMessages = msgs
      .filter((m: any) => m && typeof m.text === "string")
      .map((m: any) => ({
        id: m.id,
        roomId: m.roomId,
        senderId: m.senderId,
        senderUsername: m.senderUsername ?? null,
        text: m.text,
        createdAt: m.createdAt,
      }));
    lastRenderedChatSignature = "";
    updateOverlay();
  });

  socket.on("chat_message", (m: any) => {
    if (!m || m.roomId !== currentRoomId || typeof m.text !== "string") return;
    chatMessages = [
      ...chatMessages,
      {
        id: m.id,
        roomId: m.roomId,
        senderId: m.senderId,
        senderUsername: m.senderUsername ?? null,
        text: m.text,
        createdAt: m.createdAt,
      },
    ];
    if (chatMessages.length > 200) chatMessages = chatMessages.slice(-200);
    lastRenderedChatSignature = "";
    updateOverlay();
  });
}

function disconnect() {
  if (socket) {
    try {
      socket.removeAllListeners();
      socket.disconnect();
    } catch {
      // ignore
    }
  }
  socket = null;
  currentRoomId = null;
  localSenderId = null;
  lastConnectionError = null;
  chatMessages = [];
  lastRenderedChatSignature = "";
  stopPlayPausePoll();
  updateOverlay();
}

function emitSync(action: string, timestamp?: number) {
  if (!shouldEmitLocalSync()) return;
  const s = socket;
  const roomId = currentRoomId;
  if (!s || !roomId) return;
  const videoUrl = location.href;

  s.emit("sync_video", {
    roomId,
    action,
    timestamp,
    videoUrl,
  });
}

function withRemoteGuard<T>(fn: () => T, releaseDelayMs: number = 250): T {
  isApplyingRemote = true;
  try {
    return fn();
  } finally {
    // Give Netflix a tick to settle before we re-enable event sending.
    window.setTimeout(() => {
      isApplyingRemote = false;
    }, releaseDelayMs);
  }
}

function applyRoomStateToVideo(state: RoomState, opts?: { manual?: boolean }) {
  // If we are not going to apply any player-changing operations, do nothing.
  // This helps isolate whether Netflix errors are caused by our script.
  if (!seekEnabled && !autoPlayPauseEnabled) {
    return;
  }

  const v = getBestVideo();
  if (!v) return;

  // Avoid hammering the player; Netflix can be sensitive to rapid seek/play.
  const now = Date.now();
  if (now - lastRemoteApplyAt < 250) return;

  // Safety: only apply sync when both sides are on the same Netflix watch page.
  // If not, applying play/seek can trigger Netflix playback errors.
  const expectedWatchId =
    typeof state.videoUrl === "string"
      ? getNetflixWatchIdFromUrl(state.videoUrl)
      : null;
  const actualWatchId = getLocalWatchId();
  if (expectedWatchId && actualWatchId && expectedWatchId !== actualWatchId) {
    lastWatchIdMismatch = { expected: expectedWatchId, actual: actualWatchId };
    updateOverlay();
    return;
  }

  if (lastWatchIdMismatch) {
    lastWatchIdMismatch = null;
    updateOverlay();
  }

  const rev = typeof state.rev === "number" ? state.rev : 0;
  if (rev && rev < lastAppliedRev) return;
  if (rev) lastAppliedRev = rev;

  const desiredTime = computeDesiredTimestampNow(state);
  const desiredPlaying = state.isPlaying === true;
  const desiredRate =
    typeof state.playbackSpeed === "number" ? state.playbackSpeed : null;

  withRemoteGuard(() => {
    if (desiredRate && Math.abs(v.playbackRate - desiredRate) > 0.01) {
      v.playbackRate = desiredRate;
      lastRemoteApplyAt = Date.now();
    }

    // If the player isn't ready yet, don't force seek/play.
    if (v.readyState < 1 || !Number.isFinite(v.duration) || v.duration <= 0) {
      return;
    }

    // SEEK: apply when enabled. We use Netflix's internal player API (MAIN world).
    if (seekEnabled && desiredTime !== null && Number.isFinite(desiredTime)) {
      const drift = Math.abs(v.currentTime - desiredTime);
      if (drift > 1.0) {
        if (!hasUserGesture) return;

        lastCatchUpNote = `Syncing to ${desiredTime.toFixed(1)}s…`;
        updateOverlay();

        // Track the remote action + timestamp so video event handlers can filter echoes.
        lastRemoteAction = "seek";
        lastRemoteTimestamp = desiredTime;
        lastRemoteApplyAt = Date.now();

        // Use Netflix internal player API in MAIN world (via background).
        // This avoids directly writing v.currentTime, which often triggers Netflix errors.
        void safeNetflixSeekViaBackground(desiredTime).then((res) => {
          lastCatchUpNote = res.ok
            ? null
            : `Seek failed: ${res.error || "unknown"}`;
          updateOverlay();
        });
        return;
      }
    }

    if (desiredPlaying) {
      if (v.paused) {
        if (!autoPlayPauseEnabled) return;
        if (!hasUserGesture) {
          // Many setups block remote-initiated play until the user clicks once.
          pendingPlayOnGesture = true;
          lastCatchUpNote = "Click anywhere to resume playback.";
          updateOverlay();
          return;
        }

        lastRemoteAction = "play";
        lastRemoteTimestamp = v.currentTime;
        lastRemoteApplyAt = Date.now();

        void safeNetflixSetPlayingViaBackground(true).then((res) => {
          lastCatchUpNote = res.ok
            ? null
            : `Play failed: ${res.error || "unknown"}`;
          updateOverlay();
        });
      }
    } else {
      if (!v.paused) {
        if (!autoPlayPauseEnabled) return;
        lastRemoteAction = "pause";
        lastRemoteTimestamp = v.currentTime;
        lastRemoteApplyAt = Date.now();
        v.pause();
      }
    }
  }, 1000);
}

function attachVideoListeners() {
  const v = getBestVideo();
  if (!v) return false;
  if (listenersAttachedTo === v) return true;

  const canEmitFromGesture = (windowMs: number) =>
    Date.now() - lastUserGestureAt < windowMs;
  const canEmitNow = (
    action: string,
    timestamp: number,
    gestureWindowMs: number,
  ) => {
    if (isApplyingRemote) return false;
    if (!shouldEmitLocalSync()) return false;
    // If there was a recent user gesture, always allow the emit (it's genuinely user-initiated).
    const hasRecentGesture = canEmitFromGesture(gestureWindowMs);
    if (hasRecentGesture) return true;
    // Otherwise, filter likely echo events (video reacting to our own remote-applied action).
    if (isLikelyEchoEvent(action, timestamp)) return false;
    return true;
  };

  const onPlay = () => {
    if (!canEmitNow("play", v.currentTime, 10000)) return;
    emitSync("play", v.currentTime);
  };

  const onPause = () => {
    if (!canEmitNow("pause", v.currentTime, 10000)) return;
    emitSync("pause", v.currentTime);
  };

  const onSeeked = () => {
    // Seeking via the Netflix UI can take a few seconds from drag -> seeked.
    if (!canEmitNow("seek", v.currentTime, 15000)) return;
    emitSync("seek", v.currentTime);
  };

  const onRate = () => {
    if (isApplyingRemote) return;
    if (!shouldEmitLocalSync()) return;
    const s = socket;
    const roomId = currentRoomId;
    if (!s || !roomId) return;
    s.emit("sync_video", {
      roomId,
      action: "set_speed",
      timestamp: v.currentTime,
      playbackSpeed: v.playbackRate,
      videoUrl: location.href,
    });
  };

  v.addEventListener("play", onPlay);
  v.addEventListener("pause", onPause);
  v.addEventListener("seeked", onSeeked);
  v.addEventListener("ratechange", onRate);

  listenersAttachedTo = v;

  debugLog("attached video listeners");
  return true;
}

function ensureVideoListeners() {
  if (attachVideoListeners()) return;

  const obs = new MutationObserver(() => {
    if (attachVideoListeners()) {
      obs.disconnect();
    }
  });

  obs.observe(document.documentElement, { childList: true, subtree: true });
}

chrome.runtime.onMessage.addListener(
  (msg: any, _sender: any, sendResponse: any) => {
    if (msg?.type === "HUDDLE_CONNECT") {
      const cfg: ExtensionConfig = {
        serverUrl: FIXED_SERVER_URL,
        roomId: msg.roomId,
      };
      chrome.storage.local.set({ [STORAGE_KEYS.roomId]: cfg.roomId });
      // Clean up any legacy stored server URL from older builds.
      chrome.storage.local.remove([LEGACY_SERVER_URL_KEY]);
      connect(cfg);
      sendResponse({ ok: true });
      return true;
    }

    if (msg?.type === "HUDDLE_DISCONNECT") {
      disconnect();
      sendResponse({ ok: true });
      return true;
    }

    if (msg?.type === "HUDDLE_GET_STATUS") {
      sendResponse({
        connected: Boolean(socket && socket.connected),
        roomId: currentRoomId,
      });
      return true;
    }

    return false;
  },
);

(async () => {
  if (!location.pathname.startsWith("/watch/")) return;

  // Mark that the user interacted at least once; used to safely enable autoplay.
  const markGesture = () => {
    lastUserGestureAt = Date.now();
    if (!hasUserGesture) hasUserGesture = true;
    updateOverlay();

    if (pendingPlayOnGesture) {
      pendingPlayOnGesture = false;
      void safeNetflixSetPlayingViaBackground(true).then((res) => {
        lastCatchUpNote = res.ok
          ? null
          : `Play failed: ${res.error || "unknown"}`;
        updateOverlay();
      });
    }
  };
  document.addEventListener("pointerdown", markGesture, {
    capture: true,
    passive: true,
  });
  document.addEventListener("keydown", markGesture, { capture: true });
  ensureOverlay();
  updateOverlay();

  ensureVideoListeners();

  const cfg = await loadConfig();
  if (cfg.roomId) {
    try {
      connect(cfg);
    } catch {
      // ignore
    }
  }
})();
