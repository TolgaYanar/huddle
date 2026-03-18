"use client";

import React from "react";
import Link from "next/link";

import { RoomClientView } from "./roomClient/RoomClientView";
import { useRoomClientViewModel } from "./roomClient/useRoomClientViewModel";
import { ErrorBoundary } from "../../components/ErrorBoundary";

function RoomErrorFallback({
  roomId,
  error,
}: {
  roomId: string;
  error: Error;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-200 p-6">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-6 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center shrink-0">
            <svg
              className="w-5 h-5 text-rose-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div>
            <div className="font-semibold text-slate-50 text-sm">
              Room crashed
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              Something went wrong in room{" "}
              <span className="font-mono text-slate-300">{roomId}</span>.
            </div>
          </div>
        </div>
        {process.env.NODE_ENV !== "production" && (
          <pre className="text-xs text-rose-300 bg-rose-500/5 border border-rose-500/15 rounded-xl p-3 overflow-auto max-h-40 whitespace-pre-wrap break-all">
            {error.message}
          </pre>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="flex-1 h-9 rounded-xl border border-white/10 bg-white/5 text-slate-100 text-sm font-medium hover:bg-white/10 transition-colors"
          >
            Reload room
          </button>
          <Link
            href="/"
            className="flex-1 h-9 rounded-xl border border-white/10 bg-white/5 text-slate-100 text-sm font-medium hover:bg-white/10 transition-colors flex items-center justify-center"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function RoomClientInner({ roomId }: { roomId: string }) {
  const viewModel = useRoomClientViewModel(roomId);
  return <RoomClientView {...viewModel} />;
}

export default function RoomClient({ roomId }: { roomId: string }) {
  return (
    <ErrorBoundary fallback={(error) => <RoomErrorFallback roomId={roomId} error={error} />}>
      <RoomClientInner roomId={roomId} />
    </ErrorBoundary>
  );
}
