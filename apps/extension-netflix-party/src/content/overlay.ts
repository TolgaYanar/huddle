import type { ContentState, OverlayElements } from "./state";
import { renderChat } from "./chat";

export function ensureOverlay(
  state: ContentState,
  {
    onSendChat,
  }: {
    onSendChat: (text: string) => void;
  },
) {
  if (state.overlayRoot && state.overlayShadow && state.overlayEls) return;

  const existing = document.getElementById("huddle-netflix-overlay");
  if (existing && existing instanceof HTMLDivElement) {
    state.overlayRoot = existing;
    state.overlayShadow = state.overlayRoot.shadowRoot;
    if (!state.overlayShadow) return;
  } else {
    state.overlayRoot = document.createElement("div");
    state.overlayRoot.id = "huddle-netflix-overlay";
    state.overlayRoot.style.position = "fixed";
    state.overlayRoot.style.right = "16px";
    state.overlayRoot.style.bottom = "16px";
    state.overlayRoot.style.zIndex = "2147483647";
    state.overlayRoot.style.pointerEvents = "none";
    state.overlayShadow = state.overlayRoot.attachShadow({ mode: "open" });
    document.documentElement.appendChild(state.overlayRoot);
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

  state.overlayShadow!.innerHTML = `
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

  const panel = state.overlayShadow!.getElementById("panel") as HTMLDivElement;
  const status = state.overlayShadow!.getElementById(
    "status",
  ) as HTMLSpanElement;
  const room = state.overlayShadow!.getElementById("room") as HTMLSpanElement;
  const drift = state.overlayShadow!.getElementById("drift") as HTMLSpanElement;
  const hint = state.overlayShadow!.getElementById("hint") as HTMLDivElement;
  const collapse = state.overlayShadow!.getElementById(
    "collapse",
  ) as HTMLButtonElement;
  const dot = state.overlayShadow!.getElementById("dot") as HTMLSpanElement;
  const chatList = state.overlayShadow!.getElementById(
    "chatList",
  ) as HTMLDivElement;
  const chatInput = state.overlayShadow!.getElementById(
    "chatInput",
  ) as HTMLTextAreaElement;
  const chatSend = state.overlayShadow!.getElementById(
    "chatSend",
  ) as HTMLButtonElement;

  const syncSendButtonState = () => {
    const hasText = Boolean(String(chatInput.value || "").trim());
    chatSend.disabled = !hasText;
    chatSend.classList.toggle("disabled", !hasText);
  };

  const doSend = () => {
    const text = String(chatInput.value || "").trim();
    if (!text) return;
    onSendChat(text);
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

  const els: OverlayElements = {
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

  state.overlayEls = els;

  // Keep dot as a closure-local element.
  (state.overlayShadow as any).__huddleDot = dot;
}

export function updateOverlay(state: ContentState) {
  if (!state.overlayShadow || !state.overlayEls) return;
  const dot = (state.overlayShadow as any).__huddleDot as
    | HTMLSpanElement
    | undefined;

  const connected = Boolean(state.socket && state.socket.connected);
  const roomId = state.currentRoomId || "(none)";

  state.overlayEls.status.textContent = connected
    ? "Connected"
    : "Disconnected";
  state.overlayEls.room.textContent = roomId;

  if (
    state.pendingDriftSeconds === null ||
    !Number.isFinite(state.pendingDriftSeconds)
  ) {
    state.overlayEls.drift.textContent = "—";
  } else {
    const d = state.pendingDriftSeconds;
    const sign = d > 0.05 ? "+" : d < -0.05 ? "-" : "";
    state.overlayEls.drift.textContent = `${sign}${Math.abs(d).toFixed(1)}s`;
  }

  if (dot) {
    dot.classList.remove("ok", "bad");
    dot.classList.add(connected ? "ok" : "bad");
  }

  if (!connected) {
    state.overlayEls.hint.textContent = state.lastConnectionError
      ? `Connection error: ${state.lastConnectionError}`
      : "Open the extension popup to connect to a room.";
  } else if (state.lastWatchIdMismatch) {
    state.overlayEls.hint.textContent = `This room is watching a different title (${state.lastWatchIdMismatch.expected}). Open /watch/${state.lastWatchIdMismatch.expected} first.`;
  } else if (!state.hasUserGesture) {
    state.overlayEls.hint.textContent =
      "Click anywhere on the page once to allow playback sync.";
  } else {
    state.overlayEls.hint.textContent = state.lastCatchUpNote
      ? state.lastCatchUpNote
      : "Playback sync + chat active.";
  }

  renderChat(state);
}
