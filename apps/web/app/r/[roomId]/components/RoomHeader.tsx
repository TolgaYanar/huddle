"use client";

import React from "react";
import Link from "next/link";

import {
  apiListSavedRooms,
  apiLogout,
  apiSaveRoom,
  apiUnsaveRoom,
  type AuthUser,
} from "../../../lib/api";
import { TimerWidget } from "./TimerWidget";
import type { TimerState } from "../hooks/useTimer";

interface RoomHeaderProps {
  roomId: string;
  isConnected: boolean;
  reconnectAttempt: number;
  hasRoomPassword: boolean;
  passwordRequired: boolean;
  inviteLink: string;
  copied: boolean;
  onCopyInvite: () => void;
  onOpenWheel: () => void;
  onOpenPlaylist: () => void;
  isPlaylistOpen: boolean;
  roomName: string | null;
  isHost: boolean;
  onSetRoomName: (name: string) => void;
  onOpenSettings: () => void;
  onOpenTimer: () => void;
  timerWidgetProps: { timer: TimerState; onClick: () => void };
  authUser: AuthUser | null;
  onAuthUserChange: (user: AuthUser | null) => void;
}

export function RoomHeader({
  roomId,
  isConnected,
  reconnectAttempt,
  hasRoomPassword,
  passwordRequired,
  inviteLink,
  copied,
  onCopyInvite,
  onOpenWheel,
  onOpenPlaylist,
  isPlaylistOpen,
  roomName,
  isHost,
  onSetRoomName,
  onOpenSettings,
  onOpenTimer,
  timerWidgetProps,
  authUser,
  onAuthUserChange,
}: RoomHeaderProps) {
  const [isSaved, setIsSaved] = React.useState(false);
  const [saveBusy, setSaveBusy] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [editingName, setEditingName] = React.useState(false);
  const [nameInput, setNameInput] = React.useState("");

  const startEditName = () => {
    setNameInput(roomName ?? "");
    setEditingName(true);
  };

  const commitName = () => {
    onSetRoomName(nameInput.trim());
    setEditingName(false);
  };

  React.useEffect(() => {
    let cancelled = false;
    if (!authUser) {
      setIsSaved(false);
      return;
    }

    apiListSavedRooms()
      .then((r) => {
        if (cancelled) return;
        setIsSaved(r.rooms.some((x) => x.roomId === roomId));
      })
      .catch(() => {
        if (cancelled) return;
        setIsSaved(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authUser, roomId]);

  return (
    <header className="h-16 flex items-center justify-between px-6 lg:px-8 border-b border-white/10 backdrop-blur-md bg-black/30 sticky top-0 z-50">
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="font-semibold text-lg sm:text-xl flex items-center gap-2 text-slate-50 tracking-tight"
        >
          <picture>
            <source srcSet="/favicon.svg?v=2" type="image/svg+xml" />
            <img
              src="/favicon.svg?v=2"
              alt="WeHuddle"
              width={24}
              height={24}
              className="h-6 w-6 rounded"
            />
          </picture>
          <span>WeHuddle</span>
        </Link>
        <span className="hidden sm:inline-flex items-center gap-1.5 text-xs border border-white/10 bg-black/20 rounded-full px-3 py-1 text-slate-300">
          {editingName ? (
            <>
              <input
                autoFocus
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitName();
                  if (e.key === "Escape") setEditingName(false);
                }}
                maxLength={40}
                placeholder={roomId}
                className="bg-transparent text-slate-200 outline-none w-36 placeholder:text-slate-500"
              />
              <button
                type="button"
                onClick={commitName}
                className="text-indigo-300 hover:text-indigo-200 font-medium"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setEditingName(false)}
                className="text-slate-500 hover:text-slate-300"
              >
                ✕
              </button>
            </>
          ) : (
            <>
              <span className="text-slate-400">Room</span>
              <span className="font-medium text-slate-200 max-w-[160px] truncate">
                {roomName ?? <span className="font-mono">{roomId}</span>}
              </span>
              {isHost && (
                <button
                  type="button"
                  onClick={startEditName}
                  title="Rename room"
                  className="text-slate-500 hover:text-slate-300 transition-colors"
                >
                  ✎
                </button>
              )}
            </>
          )}
        </span>
      </div>

      <div className="flex items-center gap-3">
        {authUser ? (
          <>
            <div className="hidden md:inline-flex items-center gap-2 text-xs border border-white/10 bg-black/20 rounded-full px-3 py-1 text-slate-300">
              <span className="text-slate-400">@</span>
              <span className="text-slate-200">{authUser.username}</span>
            </div>
            <button
              type="button"
              onClick={async () => {
                try {
                  await apiLogout();
                } finally {
                  onAuthUserChange(null);
                  setIsSaved(false);
                }
              }}
              className="h-8 px-3 rounded-lg border border-white/10 bg-white/5 text-slate-200 text-xs font-medium hover:bg-white/10 transition-colors"
            >
              Logout
            </button>
          </>
        ) : (
          <Link
            href={`/login?next=${encodeURIComponent(`/r/${roomId}`)}`}
            className="h-8 px-3 rounded-lg border border-white/10 bg-white/5 text-slate-200 text-xs font-medium hover:bg-white/10 transition-colors"
          >
            Log in
          </Link>
        )}

        <button
          type="button"
          disabled={passwordRequired || !authUser || saveBusy}
          onClick={async () => {
            if (!authUser) return;
            setSaveBusy(true);
            setSaveError(null);
            try {
              if (isSaved) {
                await apiUnsaveRoom(roomId);
                setIsSaved(false);
              } else {
                await apiSaveRoom(roomId);
                setIsSaved(true);
              }
            } catch {
              setSaveError(isSaved ? "Failed to unsave" : "Failed to save");
            } finally {
              setSaveBusy(false);
            }
          }}
          className="h-8 px-3 rounded-lg border border-white/10 bg-white/5 text-slate-200 text-xs font-medium hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title={
            passwordRequired
              ? "Join with password first"
              : !authUser
                ? "Log in to save rooms"
                : isSaved
                  ? "Remove from saved rooms"
                  : "Save this room"
          }
        >
          {saveBusy ? "…" : isSaved ? "Saved" : "Save"}
        </button>

        {saveError && (
          <span className="text-xs text-rose-400">{saveError}</span>
        )}

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
          type="button"
          onClick={onOpenPlaylist}
          disabled={passwordRequired}
          className={`h-8 px-3 rounded-lg border text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            isPlaylistOpen
              ? "border-indigo-500/50 bg-indigo-500/20 text-indigo-200"
              : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
          }`}
          title={
            passwordRequired
              ? "Join with password first"
              : "Toggle playlist panel"
          }
        >
          Playlist
        </button>

        <button
          type="button"
          onClick={onCopyInvite}
          className="h-8 px-3 rounded-lg border border-white/10 bg-white/5 text-slate-200 text-xs font-medium hover:bg-white/10 transition-colors"
          title={inviteLink || ""}
        >
          {copied ? "Copied" : "Copy invite"}
        </button>

        <TimerWidget {...timerWidgetProps} />

        <button
          type="button"
          onClick={onOpenTimer}
          disabled={passwordRequired}
          className="h-8 px-3 rounded-lg border border-white/10 bg-white/5 text-slate-200 text-xs font-medium hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title={passwordRequired ? "Join with password first" : "Open timer"}
        >
          Timer
        </button>

        {isHost && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="h-8 px-3 rounded-lg border border-indigo-500/40 bg-indigo-500/10 text-indigo-200 text-xs font-medium hover:bg-indigo-500/20 transition-colors"
            title="Room settings"
          >
            Settings
          </button>
        )}

        <span className="hidden sm:inline-flex items-center gap-2 text-xs font-medium bg-black/20 px-3 py-1 rounded-full border border-white/10">
          <span className="text-slate-300">Password</span>
          <span
            className={hasRoomPassword ? "text-amber-200" : "text-slate-200"}
          >
            {hasRoomPassword ? "On" : "Off"}
          </span>
        </span>

        <div className={`flex items-center gap-2 text-xs sm:text-sm font-medium px-3 py-1 rounded-full border transition-colors ${
          isConnected
            ? "bg-black/20 border-white/10"
            : "bg-rose-500/10 border-rose-500/30"
        }`}>
          <div className="relative shrink-0">
            <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? "bg-emerald-500" : "bg-rose-500"}`} />
            {isConnected && (
              <div className="absolute -inset-1 rounded-full ring-2 ring-emerald-500/20" />
            )}
          </div>
          {isConnected
            ? "Connected"
            : reconnectAttempt > 0
              ? `Reconnecting… (${reconnectAttempt}/5)`
              : "Disconnected"}
        </div>
      </div>
    </header>
  );
}
