"use client";

import React, { useEffect, useState } from "react";

interface ReconnectBannerProps {
  isConnected: boolean;
  reconnectAttempt: number;
  reconnectFailed: boolean;
  onManualReconnect: () => void;
}

export function ReconnectBanner({
  isConnected,
  reconnectAttempt,
  reconnectFailed,
  onManualReconnect,
}: ReconnectBannerProps) {
  const [visible, setVisible] = useState(false);
  const [justReconnected, setJustReconnected] = useState(false);

  useEffect(() => {
    if (!isConnected) {
      setVisible(true);
      setJustReconnected(false);
    } else if (visible) {
      // Show "reconnected" briefly then hide.
      setJustReconnected(true);
      const t = setTimeout(() => {
        setVisible(false);
        setJustReconnected(false);
      }, 2500);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  if (!visible) return null;

  if (justReconnected) {
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
        <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-emerald-600/90 border border-emerald-500/40 shadow-xl backdrop-blur-md text-white text-sm font-medium">
          <div className="w-2 h-2 rounded-full bg-emerald-300" />
          Reconnected
        </div>
      </div>
    );
  }

  if (reconnectFailed) {
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-slate-900/95 border border-rose-500/40 shadow-xl backdrop-blur-md">
          <div className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
          <span className="text-sm text-slate-200 font-medium">Connection lost</span>
          <div className="flex gap-2 ml-1">
            <button
              type="button"
              onClick={onManualReconnect}
              className="px-3 py-1 rounded-lg bg-sky-600 text-white text-xs font-semibold hover:bg-sky-500 transition-colors"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-3 py-1 rounded-lg border border-white/10 bg-white/5 text-slate-300 text-xs font-medium hover:bg-white/10 transition-colors"
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
      <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-slate-900/95 border border-amber-500/30 shadow-xl backdrop-blur-md">
        {/* Spinner */}
        <svg
          className="w-3.5 h-3.5 animate-spin text-amber-400 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
        <span className="text-sm text-slate-200 font-medium">
          {reconnectAttempt > 0
            ? `Reconnecting… (${reconnectAttempt}/5)`
            : "Reconnecting…"}
        </span>
      </div>
    </div>
  );
}
