"use client";

import React from "react";
import Image from "next/image";

import { Modal } from "../../../components/Modal";
import type { VideoPreview } from "../types";
import { getYouTubeStartTime, formatStartTime } from "../lib/video";

interface VideoPreviewModalProps {
  showPreviewModal: boolean;
  videoPreview: VideoPreview | null;
  isPreviewLoading: boolean;
  onLoadVideo: (url: string) => void;
  onClose: () => void;
}

export function VideoPreviewModal({
  showPreviewModal,
  videoPreview,
  isPreviewLoading,
  onLoadVideo,
  onClose,
}: VideoPreviewModalProps) {
  if (!videoPreview) return null;

  return (
    <Modal
      open={showPreviewModal}
      onClose={onClose}
      labelledBy="video-preview-title"
      panelClassName="max-w-2xl w-full rounded-2xl border border-white/20 bg-slate-900 overflow-hidden shadow-2xl"
    >
      {/* Thumbnail */}
      {videoPreview.thumbnail && (
        <div className="relative aspect-video bg-slate-950">
          <Image
            src={videoPreview.thumbnail}
            alt={videoPreview.title}
            fill
            className="object-cover"
            unoptimized
          />
          <div className="absolute inset-0 bg-linear-to-t from-slate-900/90 to-transparent" />
          {videoPreview.duration && (
            <div className="absolute bottom-3 right-3 bg-black/75 px-2 py-1 rounded text-xs font-semibold">
              {videoPreview.duration}
            </div>
          )}
        </div>
      )}

      {/* Content */}
      <div className="p-6">
        <h2
          id="video-preview-title"
          className="text-xl font-bold text-slate-50 mb-2"
        >
          {videoPreview.title}
        </h2>
        <div className="text-sm text-slate-400 mb-1 font-medium uppercase tracking-wide">
          {videoPreview.platform}
        </div>
        <div className="text-sm text-slate-400 mb-4 flex flex-wrap gap-x-4 gap-y-1">
          <span>
            Duration:{" "}
            <span className="text-slate-300 font-semibold">
              {videoPreview.duration ?? "Unavailable"}
            </span>
          </span>
          {(() => {
            const startTime = getYouTubeStartTime(videoPreview.url);
            if (startTime && startTime > 0) {
              return (
                <span>
                  Starts at:{" "}
                  <span className="text-indigo-400 font-semibold">
                    {formatStartTime(startTime)}
                  </span>
                </span>
              );
            }
            return null;
          })()}
        </div>
        <div className="text-sm text-slate-500 font-mono break-all mb-6">
          {videoPreview.url}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => onLoadVideo(videoPreview.url)}
            className="flex-1 h-11 rounded-xl font-semibold text-sm transition-colors bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 disabled:hover:bg-indigo-600"
            disabled={isPreviewLoading}
            autoFocus
          >
            {isPreviewLoading ? "Loading…" : "Load Video"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-11 px-6 rounded-xl font-semibold text-sm transition-colors border border-white/10 bg-white/5 text-slate-100 hover:bg-white/10"
          >
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}
