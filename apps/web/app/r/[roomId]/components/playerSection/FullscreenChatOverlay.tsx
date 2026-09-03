"use client";

import React from "react";
import { useFollowToBottom } from "../../hooks/useFollowToBottom";

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
  sendChat,
}: {
  isPlayerFullscreen: boolean;
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  playerContainerRef: React.RefObject<HTMLDivElement | null>;
  isConnected: boolean;
  messages: ChatMessage[];
  sendChat: (text: string) => boolean;
}) {
  const [chatText, setChatText] = React.useState("");
  const isChatVisible = isPlayerFullscreen && open;
  const {
    scrollContainerRef: fullscreenChatScrollRef,
    handleScroll: handleFullscreenChatScroll,
  } = useFollowToBottom<HTMLDivElement>(messages, { enabled: isChatVisible });
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
      // Bail before any layout work if nothing is being dragged or resized.
      // This listener is attached at the window level, so it'd otherwise
      // force a getBoundingClientRect() on every cursor pixel — wasted
      // layout flushes that show up as input lag while a video plays.
      if (!isDraggingChatRef.current && !isResizingChatRef.current) return;

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
      {/* Position and size live in an inline style, not a regenerated global
          stylesheet: these values change on every pointermove while the panel
          is dragged or resized, and rewriting a <style> element per frame
          forces a document-wide style recalculation. */}
      <div
        className="absolute z-50"
        style={{
          left: fullscreenChatPos?.x ?? 12,
          top: fullscreenChatPos?.y ?? 12,
          width: fullscreenChatSize?.w ?? 380,
          height: fullscreenChatSize?.h ?? 320,
        }}
      >
        <div
          ref={fullscreenChatPanelRef}
          className="rounded-[var(--radius-panel)] border border-hairline bg-sunken backdrop-blur-md overflow-hidden h-full flex flex-col"
        >
          <div
            className="px-4 py-3 border-b border-hairline bg-sunken flex items-center justify-between select-none cursor-move"
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
            <div className="text-sm font-semibold text-ink">Chat</div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-8 px-3 rounded-[var(--radius-control)] border border-hairline bg-surface text-ink text-xs font-semibold hover:bg-raised transition-colors"
            >
              Close
            </button>
          </div>

          <div
            ref={fullscreenChatScrollRef}
            onScroll={handleFullscreenChatScroll}
            role="region"
            aria-label="Fullscreen chat messages"
            className="p-3 flex-1 min-h-0 overflow-y-auto space-y-2"
          >
            {messages.length === 0 ? (
              <div className="text-sm text-ink-faint">No messages yet.</div>
            ) : (
              messages.map((m, idx) => (
                <div
                  key={`${idx}:${m.time}:${m.user}`}
                  className="text-sm text-ink"
                >
                  <span className="text-ink-muted text-xs mr-2">{m.time}</span>
                  <strong className="text-ink">{m.user}</strong>{" "}
                  <span className="text-ink">{m.msg}</span>
                </div>
              ))
            )}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (sendChat(chatText)) setChatText("");
            }}
            className="p-3 border-t border-hairline bg-sunken flex gap-2"
          >
            <input
              type="text"
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              placeholder={isConnected ? "Type a message..." : "Connecting..."}
              disabled={!isConnected}
              className="flex-1 h-10 bg-sunken border border-hairline rounded-[var(--radius-control)] px-3 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent transition disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!isConnected || !chatText.trim()}
              className="h-10 px-4 rounded-[var(--radius-control)] border border-hairline bg-surface text-ink text-sm font-semibold hover:bg-raised transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
            <div className="w-full h-full rounded border border-hairline-strong bg-raised" />
          </div>
        </div>
      </div>
    </>
  );
}
