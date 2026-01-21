import type { ContentState } from "./state";

function formatChatTime(raw?: string | Date) {
  try {
    const d = raw instanceof Date ? raw : raw ? new Date(raw) : null;
    if (!d || Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function renderChat(state: ContentState) {
  if (!state.overlayEls) return;
  const list = state.overlayEls.chatList;

  const last = state.chatMessages.length
    ? state.chatMessages[state.chatMessages.length - 1]
    : null;
  const signature = `${state.chatMessages.length}:${last?.id || ""}:${String(
    last?.createdAt || "",
  )}`;
  if (signature === state.lastRenderedChatSignature) return;
  state.lastRenderedChatSignature = signature;

  const prevScrollTop = list.scrollTop;
  const prevScrollHeight = list.scrollHeight;
  const nearBottom =
    prevScrollHeight - (prevScrollTop + list.clientHeight) < 80;

  list.textContent = "";

  const recent = state.chatMessages.slice(-150);
  if (recent.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No messages yet.";
    list.appendChild(empty);
  } else {
    for (const m of recent) {
      const isMe = Boolean(
        state.localSenderId && m.senderId === state.localSenderId,
      );
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

  if (nearBottom) {
    list.scrollTop = list.scrollHeight;
  } else {
    const newScrollHeight = list.scrollHeight;
    list.scrollTop =
      prevScrollTop + Math.max(0, newScrollHeight - prevScrollHeight);
  }
}
