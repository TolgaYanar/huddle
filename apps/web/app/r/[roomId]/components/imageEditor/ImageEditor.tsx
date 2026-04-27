"use client";

import React from "react";

import { Modal } from "../../../../components/Modal";

type Tool = "black" | "pixelate";

type Rect = {
  x: number;
  y: number;
  w: number;
  h: number;
  tool: Tool;
};

interface ImageEditorProps {
  /** Source URL or data URL of the image to edit. Falsy means modal is closed. */
  src: string | null;
  onClose: () => void;
  /**
   * Called with a JPEG data URL of the edited image. Caller decides whether
   * to swap the source field to it.
   */
  onSave: (editedDataUrl: string) => void;
}

const PIXELATE_BLOCK_SIZE = 12;
const MAX_OUTPUT_DIMENSION = 1024;

/**
 * Draw the source image (already loaded) plus all redaction rects onto the
 * given canvas at its current pixel size. Rects are stored in image-pixel
 * coordinates; this fn handles scaling to the canvas.
 */
function paintCanvas(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  rects: Rect[],
  draftRect: Rect | null,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const scaleX = canvas.width / img.naturalWidth;
  const scaleY = canvas.height / img.naturalHeight;

  const drawRect = (r: Rect) => {
    const x = r.x * scaleX;
    const y = r.y * scaleY;
    const w = r.w * scaleX;
    const h = r.h * scaleY;
    if (r.tool === "black") {
      ctx.fillStyle = "#000";
      ctx.fillRect(x, y, w, h);
    } else if (r.tool === "pixelate") {
      // Pixelate by drawing the underlying region scaled down then up.
      // Read from canvas to avoid CORS taint when the image is cross-origin
      // (we already drew it once). Note this means pixelate stacks if you
      // overlap — that's fine.
      const block = Math.max(2, Math.floor(PIXELATE_BLOCK_SIZE * scaleX));
      try {
        const data = ctx.getImageData(x, y, w, h);
        // Make a tiny scratch canvas, draw downscaled, then upscale back.
        const scratch = document.createElement("canvas");
        scratch.width = Math.max(1, Math.round(w / block));
        scratch.height = Math.max(1, Math.round(h / block));
        const sctx = scratch.getContext("2d");
        if (!sctx) return;
        // Put the original region into a temp canvas, then draw scaled down.
        const region = document.createElement("canvas");
        region.width = Math.round(w);
        region.height = Math.round(h);
        const rctx = region.getContext("2d");
        if (!rctx) return;
        rctx.putImageData(data, 0, 0);
        sctx.imageSmoothingEnabled = true;
        sctx.drawImage(region, 0, 0, scratch.width, scratch.height);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(scratch, 0, 0, scratch.width, scratch.height, x, y, w, h);
        ctx.imageSmoothingEnabled = true;
      } catch {
        // CORS-tainted canvas — fall back to opaque black so the redaction
        // still works visually.
        ctx.fillStyle = "#000";
        ctx.fillRect(x, y, w, h);
      }
    }
  };

  for (const r of rects) drawRect(r);
  if (draftRect) drawRect(draftRect);
}

export function ImageEditor({ src, onClose, onSave }: ImageEditorProps) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const imageRef = React.useRef<HTMLImageElement | null>(null);
  const dragRef = React.useRef<{
    startX: number;
    startY: number;
    pointerId: number;
  } | null>(null);

  const [tool, setTool] = React.useState<Tool>("black");
  const [rects, setRects] = React.useState<Rect[]>([]);
  const [draftRect, setDraftRect] = React.useState<Rect | null>(null);
  const [imgState, setImgState] = React.useState<
    "loading" | "ready" | "error"
  >("loading");
  const [tainted, setTainted] = React.useState(false);

  // Load the image whenever src changes; reset state.
  React.useEffect(() => {
    if (!src) return;
    setImgState("loading");
    setRects([]);
    setDraftRect(null);
    setTainted(false);

    const img = new Image();
    if (!src.startsWith("data:")) img.crossOrigin = "anonymous";
    img.onload = () => {
      imageRef.current = img;
      setImgState("ready");
    };
    img.onerror = () => {
      // If CORS blocked anonymous load, retry without — we can still render
      // it for visual editing, but toDataURL will be tainted.
      const img2 = new Image();
      img2.onload = () => {
        imageRef.current = img2;
        setTainted(true);
        setImgState("ready");
      };
      img2.onerror = () => setImgState("error");
      img2.src = src;
    };
    img.src = src;

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [src]);

  // Resize the canvas to fit the container while keeping aspect ratio.
  // Repaint after any state change.
  React.useEffect(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    const container = containerRef.current;
    if (!canvas || !img || !container || imgState !== "ready") return;

    const containerWidth = container.clientWidth;
    const ratio = img.naturalHeight / img.naturalWidth;
    const cssWidth = Math.min(containerWidth, img.naturalWidth);
    const cssHeight = cssWidth * ratio;

    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);

    paintCanvas(canvas, img, rects, draftRect);
  }, [imgState, rects, draftRect]);

  // Translate pointer event coords to image-pixel coords.
  const eventToImageCoords = React.useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return null;
    const rect = canvas.getBoundingClientRect();
    const cssX = e.clientX - rect.left;
    const cssY = e.clientY - rect.top;
    const x = (cssX / rect.width) * img.naturalWidth;
    const y = (cssY / rect.height) * img.naturalHeight;
    return { x, y };
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (imgState !== "ready") return;
    const p = eventToImageCoords(e);
    if (!p) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: p.x, startY: p.y, pointerId: e.pointerId };
    setDraftRect({ x: p.x, y: p.y, w: 0, h: 0, tool });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const p = eventToImageCoords(e);
    if (!p) return;
    const x = Math.min(drag.startX, p.x);
    const y = Math.min(drag.startY, p.y);
    const w = Math.abs(p.x - drag.startX);
    const h = Math.abs(p.y - drag.startY);
    setDraftRect({ x, y, w, h, tool });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    if (draftRect && draftRect.w > 4 && draftRect.h > 4) {
      setRects((prev) => [...prev, draftRect]);
    }
    setDraftRect(null);
  };

  const undo = () => {
    setRects((prev) => prev.slice(0, -1));
  };
  const clear = () => setRects([]);

  // Render the final image at original resolution (or capped) and return as
  // a data URL. We do this off-DOM with a fresh canvas so the on-screen
  // canvas isn't disturbed.
  const handleSave = () => {
    const img = imageRef.current;
    if (!img) return;
    if (tainted) {
      // Sourcing image cross-origin without CORS — toDataURL will throw.
      // Surface a friendly error rather than a stack trace.
      window.alert(
        "This image's source doesn't allow editing in-browser. Pick a different image (the AI tab works) and try again.",
      );
      return;
    }

    let outW = img.naturalWidth;
    let outH = img.naturalHeight;
    if (outW > MAX_OUTPUT_DIMENSION || outH > MAX_OUTPUT_DIMENSION) {
      const scale = MAX_OUTPUT_DIMENSION / Math.max(outW, outH);
      outW = Math.round(outW * scale);
      outH = Math.round(outH * scale);
    }

    const out = document.createElement("canvas");
    out.width = outW;
    out.height = outH;
    paintCanvas(out, img, rects, null);

    try {
      const url = out.toDataURL("image/jpeg", 0.82);
      onSave(url);
    } catch (err) {
      console.error("Image editor save failed", err);
      window.alert(
        "Couldn't save the edit — the image source may be CORS-restricted. Try a different image.",
      );
    }
  };

  if (!src) return null;

  return (
    <Modal
      open={Boolean(src)}
      onClose={onClose}
      labelledBy="image-editor-title"
      panelClassName="w-full max-w-2xl rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-2xl"
    >
      <div className="flex items-center justify-between mb-4">
        <h2
          id="image-editor-title"
          className="text-base font-semibold text-slate-100"
        >
          Cover up parts of the image
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="text-slate-500 hover:text-slate-200 text-sm"
        >
          Cancel
        </button>
      </div>

      <p className="text-xs text-slate-500 mb-3 leading-relaxed">
        Click and drag to redact parts of the image. Use this to hide brand
        logos, text, or anything that gives away the answer.
      </p>

      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <button
          type="button"
          onClick={() => setTool("black")}
          aria-pressed={tool === "black" ? "true" : "false"}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            tool === "black"
              ? "border-sky-500/50 bg-sky-500/15 text-sky-200"
              : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
          }`}
        >
          ▬ Black bar
        </button>
        <button
          type="button"
          onClick={() => setTool("pixelate")}
          aria-pressed={tool === "pixelate" ? "true" : "false"}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            tool === "pixelate"
              ? "border-sky-500/50 bg-sky-500/15 text-sky-200"
              : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
          }`}
        >
          ▦ Pixelate
        </button>
        <span className="flex-1" />
        <button
          type="button"
          onClick={undo}
          disabled={rects.length === 0}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Undo
        </button>
        <button
          type="button"
          onClick={clear}
          disabled={rects.length === 0}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border border-white/10 bg-white/5 text-slate-400 hover:bg-white/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Clear
        </button>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="rounded-xl border border-white/10 bg-black/30 overflow-hidden flex items-center justify-center min-h-48 select-none"
      >
        {imgState === "loading" && (
          <div className="text-sm text-slate-500 py-8">Loading image…</div>
        )}
        {imgState === "error" && (
          <div className="text-sm text-rose-400 py-8 text-center px-4">
            Couldn&apos;t load that image. Try a different one.
          </div>
        )}
        {imgState === "ready" && (
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="touch-none cursor-crosshair max-w-full"
          />
        )}
      </div>

      {tainted && (
        <p className="text-xs text-amber-400/80 mt-2">
          Heads up: this image source blocks in-browser editing. Pick from
          AI or paste a different URL if you need to redact.
        </p>
      )}

      {/* Footer */}
      <div className="flex gap-3 mt-4">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 py-2.5 rounded-xl border border-white/10 bg-white/5 text-slate-300 text-sm hover:bg-white/10 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={imgState !== "ready"}
          className="flex-1 py-2.5 rounded-xl bg-sky-600 text-white text-sm font-semibold hover:bg-sky-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {rects.length === 0 ? "Use as-is" : `Save (${rects.length} edit${rects.length === 1 ? "" : "s"})`}
        </button>
      </div>
    </Modal>
  );
}
