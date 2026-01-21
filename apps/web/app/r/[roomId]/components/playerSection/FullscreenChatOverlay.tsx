"use client";

import React from "react";

type ChatMessage = {
  msg: string;
  time: string;
  user: string;
};

export function FullscreenChatOverlay({
  isPlayerFullscreen,
  open,
  setOpen,
  playerContainerRef,
  isConnected,
  messages,
  chatText,
  setChatText,
  handleSendChat,
}: {
  isPlayerFullscreen: boolean;
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  playerContainerRef: React.RefObject<HTMLDivElement | null>;
  isConnected: boolean;
  messages: ChatMessage[];
  chatText: string;
  setChatText: React.Dispatch<React.SetStateAction<string>>;
  handleSendChat: (e: React.FormEvent) => void;
}) {
  const fullscreenChatPanelRef = React.useRef<HTMLDivElement | null>(null);
  const isDraggingChatRef = React.useRef(false);
  const dragOffsetRef = React.useRef<{ dx: number; dy: number } | null>(null);
  const [fullscreenChatPos, setFullscreenChatPos] = React.useState<{
    x: number;
    y: number;
  } | null>(null);
  const [fullscreenChatSize, setFullscreenChatSize] = React.useState<{
    w: number;
    h: number;
  } | null>(null);
  const isResizingChatRef = React.useRef(false);
  const resizeStartRef = React.useRef<{
    startX: number;
    startY: number;
    startW: number;
    startH: number;
    posX: number;
    posY: number;
  } | null>(null);

  const clampChatPos = React.useCallback(
    (x: number, y: number) => {
      const container = playerContainerRef.current;
      const panel = fullscreenChatPanelRef.current;
      if (!container || !panel) return { x, y };

      const cw = container.clientWidth;
      const ch = container.clientHeight;
      const pw = panel.offsetWidth;
      const ph = panel.offsetHeight;

      const padding = 12;
      const maxX = Math.max(padding, cw - pw - padding);
      const maxY = Math.max(padding, ch - ph - padding);

      return {
        x: Math.min(Math.max(padding, x), maxX),
        y: Math.min(Math.max(padding, y), maxY),
      };
    },
    [playerContainerRef],
  );

  const clampChatSize = React.useCallback(
    (w: number, h: number, x: number, y: number) => {
      const container = playerContainerRef.current;
      if (!container) return { w, h };

      const cw = container.clientWidth;
      const ch = container.clientHeight;
      const padding = 12;

      const minW = 280;
      const minH = 200;

      const maxW = Math.max(minW, cw - x - padding);
      const maxH = Math.max(minH, ch - y - padding);

      return {
        w: Math.min(Math.max(minW, Math.round(w)), Math.round(maxW)),
        h: Math.min(Math.max(minH, Math.round(h)), Math.round(maxH)),
      };
    },
    [playerContainerRef],
  );

  React.useEffect(() => {
    if (!isPlayerFullscreen || !open) return;
    if (fullscreenChatPos) return;

    const container = playerContainerRef.current;
    if (!container) return;

    const padding = 12;

    const id = window.requestAnimationFrame(() => {
      const panel = fullscreenChatPanelRef.current;
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      const pw = panel?.offsetWidth ?? 380;
      const ph = panel?.offsetHeight ?? 320;
      const initialPos = clampChatPos(cw - pw - padding, ch - ph - padding);
      setFullscreenChatPos(initialPos);

      const initialSize = clampChatSize(pw, ph, initialPos.x, initialPos.y);
      setFullscreenChatSize(initialSize);
    });

    return () => window.cancelAnimationFrame(id);
  }, [
    isPlayerFullscreen,
    open,
    fullscreenChatPos,
    clampChatPos,
    clampChatSize,
    playerContainerRef,
  ]);

  React.useEffect(() => {
    if (isPlayerFullscreen && open) return;
    isDraggingChatRef.current = false;
    dragOffsetRef.current = null;
    isResizingChatRef.current = false;
    resizeStartRef.current = null;
  }, [isPlayerFullscreen, open]);

  React.useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const container = playerContainerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();

      if (isDraggingChatRef.current) {
        const offset = dragOffsetRef.current;
        if (!offset) return;
        const x = e.clientX - rect.left - offset.dx;
        const y = e.clientY - rect.top - offset.dy;
        const next = clampChatPos(x, y);
        setFullscreenChatPos(next);
      }

      if (isResizingChatRef.current) {
        const start = resizeStartRef.current;
        if (!start) return;

        const dx = e.clientX - start.startX;
        const dy = e.clientY - start.startY;

        const proposedW = start.startW + dx;
        const proposedH = start.startH + dy;

        const nextSize = clampChatSize(
          proposedW,
          proposedH,
          start.posX,
          start.posY,
        );
        setFullscreenChatSize(nextSize);
      }
    };

    const onUp = () => {
      if (isDraggingChatRef.current) {
        isDraggingChatRef.current = false;
        dragOffsetRef.current = null;
      }

      if (isResizingChatRef.current) {
        isResizingChatRef.current = false;
        resizeStartRef.current = null;
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [clampChatPos, clampChatSize, playerContainerRef]);

  React.useEffect(() => {
    if (!fullscreenChatPos) return;
    const next = clampChatPos(fullscreenChatPos.x, fullscreenChatPos.y);
    if (next.x !== fullscreenChatPos.x || next.y !== fullscreenChatPos.y) {
      setFullscreenChatPos(next);
    }
  }, [fullscreenChatPos, fullscreenChatSize, clampChatPos]);

  if (!isPlayerFullscreen || !open) return null;

  return (
    <>
      <div className="absolute z-50 fullscreenChatPanel">
        <div
          ref={fullscreenChatPanelRef}
          className="rounded-2xl border border-white/10 bg-black/50 backdrop-blur-md overflow-hidden h-full flex flex-col"
        >
          <div
            className="px-4 py-3 border-b border-white/10 bg-black/20 flex items-center justify-between select-none cursor-move"
            onPointerDown={(e) => {
              const container = playerContainerRef.current;
              const panel = fullscreenChatPanelRef.current;
              if (!container || !panel) return;
              if (e.button !== 0) return;

              const rect = container.getBoundingClientRect();
              const current = fullscreenChatPos ?? { x: 12, y: 12 };
              const dx = e.clientX - rect.left - current.x;
              const dy = e.clientY - rect.top - current.y;
              dragOffsetRef.current = { dx, dy };
              isDraggingChatRef.current = true;
              try {
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              } catch {
                // ignore
              }
            }}
          >
            <div className="text-sm font-semibold text-slate-50">Chat</div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-8 px-3 rounded-xl border border-white/10 bg-white/5 text-slate-100 text-xs font-semibold hover:bg-white/10 transition-colors"
            >
              Close
            </button>
          </div>

          <div className="p-3 flex-1 min-h-0 overflow-y-auto space-y-2">
            {messages.length === 0 ? (
              <div className="text-sm text-slate-500">No messages yet.</div>
            ) : (
              messages.map((m, idx) => (
                <div
                  key={`${idx}:${m.time}:${m.user}`}
                  className="text-sm text-slate-200"
                >
                  <span className="text-slate-400 text-xs mr-2">{m.time}</span>
                  <strong className="text-slate-50">{m.user}</strong>{" "}
                  <span className="text-slate-200">{m.msg}</span>
                </div>
              ))
            )}
          </div>

          <form
            onSubmit={handleSendChat}
            className="p-3 border-t border-white/10 bg-black/20 flex gap-2"
          >
            <input
              type="text"
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              placeholder={isConnected ? "Type a message..." : "Connecting..."}
              disabled={!isConnected}
              className="flex-1 h-10 bg-black/30 border border-white/10 rounded-xl px-3 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/25 focus:border-sky-500/30 transition disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!isConnected || !chatText.trim()}
              className="h-10 px-4 rounded-xl border border-white/10 bg-white/5 text-slate-50 text-sm font-semibold hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </form>

          <div
            className="absolute right-2 bottom-2 z-10 w-4 h-4 cursor-se-resize"
            onPointerDown={(e) => {
              const container = playerContainerRef.current;
              if (!container) return;
              if (e.button !== 0) return;
              e.preventDefault();
              e.stopPropagation();

              const pos = fullscreenChatPos ?? { x: 12, y: 12 };
              const size = fullscreenChatSize ?? { w: 380, h: 320 };

              isResizingChatRef.current = true;
              resizeStartRef.current = {
                startX: e.clientX,
                startY: e.clientY,
                startW: size.w,
                startH: size.h,
                posX: pos.x,
                posY: pos.y,
              };
              try {
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              } catch {
                // ignore
              }
            }}
            title="Resize"
          >
            <div className="w-full h-full rounded border border-white/20 bg-white/10" />
          </div>
        </div>
      </div>
      {/* eslint-disable-next-line react/no-unknown-property */}
      <style jsx>{`
        .fullscreenChatPanel {
          left: ${fullscreenChatPos?.x ?? 12}px;
          top: ${fullscreenChatPos?.y ?? 12}px;
          width: ${fullscreenChatSize?.w ?? 380}px;
          height: ${fullscreenChatSize?.h ?? 320}px;
        }
      `}</style>
    </>
  );
}
