import React from "react";
import Link from "next/link";

interface RoomHeaderProps {
  roomId: string;
  isConnected: boolean;
  hasRoomPassword: boolean;
  passwordRequired: boolean;
  inviteLink: string;
  copied: boolean;
  onCopyInvite: () => void;
  onOpenWheel: () => void;
}

export function RoomHeader({
  roomId,
  isConnected,
  hasRoomPassword,
  passwordRequired,
  inviteLink,
  copied,
  onCopyInvite,
  onOpenWheel,
}: RoomHeaderProps) {
  return (
    <header className="h-16 flex items-center justify-between px-6 lg:px-8 border-b border-white/10 backdrop-blur-md bg-black/30 sticky top-0 z-50">
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="font-semibold text-lg sm:text-xl flex items-center gap-2 text-slate-50 tracking-tight"
        >
          <span aria-hidden className="text-xl">
            🍿
          </span>
          <span>Huddle</span>
        </Link>
        <span className="hidden sm:inline-flex items-center gap-2 text-xs border border-white/10 bg-black/20 rounded-full px-3 py-1 text-slate-300">
          Room <span className="font-mono text-slate-200">{roomId}</span>
        </span>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenWheel}
          disabled={passwordRequired}
          className="h-8 px-3 rounded-lg border border-white/10 bg-white/5 text-slate-200 text-xs font-medium hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title={
            passwordRequired ? "Join with password first" : "Open wheel picker"
          }
        >
          Wheel
        </button>

        <button
          onClick={onCopyInvite}
          className="h-8 px-3 rounded-lg border border-white/10 bg-white/5 text-slate-200 text-xs font-medium hover:bg-white/10 transition-colors"
          title={inviteLink || ""}
        >
          {copied ? "Copied" : "Copy invite"}
        </button>

        <span className="hidden sm:inline-flex items-center gap-2 text-xs font-medium bg-black/20 px-3 py-1 rounded-full border border-white/10">
          <span className="text-slate-300">Password</span>
          <span
            className={hasRoomPassword ? "text-amber-200" : "text-slate-200"}
          >
            {hasRoomPassword ? "On" : "Off"}
          </span>
        </span>

        <div className="flex items-center gap-2 text-xs sm:text-sm font-medium bg-black/20 px-3 py-1 rounded-full border border-white/10">
          <div className="relative">
            <div
              className={`w-2.5 h-2.5 rounded-full ${
                isConnected ? "bg-emerald-500" : "bg-rose-500"
              }`}
            />
            <div
              className={`absolute -inset-1 rounded-full ${
                isConnected
                  ? "ring-2 ring-emerald-500/20"
                  : "ring-2 ring-rose-500/20"
              }`}
            />
          </div>
          {isConnected ? "Connected" : "Reconnecting…"}
        </div>
      </div>
    </header>
  );
}
