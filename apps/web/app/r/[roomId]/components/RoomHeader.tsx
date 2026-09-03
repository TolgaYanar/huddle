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
import { ThemeToggle } from "../../../components/ThemeToggle";

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
  isChatOnlyMode: boolean;
  onToggleChatOnlyMode: () => void;
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
  isChatOnlyMode,
  onToggleChatOnlyMode,
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
    <header className="h-auto min-h-16 sm:h-16 flex items-center justify-between gap-3 px-4 sm:px-6 lg:px-8 py-2 sm:py-0 border-b border-hairline backdrop-blur-sm bg-bg sticky top-0 z-50 ">
      <div className="flex items-center gap-3 min-w-0">
        <Link
          href="/"
          className="font-semibold text-lg sm:text-xl flex items-center gap-2 text-ink tracking-tight shrink-0 group"
        >
          <picture>
            <source srcSet="/favicon.svg?v=3" type="image/svg+xml" />
            <img
              src="/favicon.svg?v=3"
              alt="WeHuddle"
              width={24}
              height={24}
              className="h-6 w-6 rounded transition-transform group-hover:scale-110"
            />
          </picture>
          <span className="hidden sm:inline font-serif font-normal text-[1.35em] leading-none">
            WeHuddle
          </span>
        </Link>
        <span className="hidden sm:inline-flex items-center gap-1.5 text-xs border border-hairline bg-sunken rounded-full px-3 py-1 text-ink-muted min-w-0">
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
                className="bg-transparent text-ink outline-none w-36 placeholder:text-ink-faint"
              />
              <button
                type="button"
                onClick={commitName}
                className="text-accent hover:brightness-110 font-medium"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setEditingName(false)}
                className="text-ink-faint hover:text-ink-muted"
              >
                ✕
              </button>
            </>
          ) : (
            <>
              <span className="text-ink-muted">Room</span>
              <span className="font-medium text-ink max-w-[160px] truncate">
                {roomName ?? <span className="font-mono">{roomId}</span>}
              </span>
              {isHost && (
                <button
                  type="button"
                  onClick={startEditName}
                  title="Rename room"
                  className="text-ink-faint hover:text-ink-muted transition-colors"
                >
                  ✎
                </button>
              )}
            </>
          )}
        </span>
      </div>

      <div className="flex flex-1 min-w-0 flex-wrap justify-end items-center gap-1.5 sm:flex-none sm:flex-nowrap sm:gap-2">
        {authUser ? (
          <>
            <div className="hidden md:inline-flex items-center gap-1.5 text-xs border border-hairline bg-sunken rounded-full px-3 py-1 text-ink-muted">
              <span className="text-ink-faint">@</span>
              <span className="text-ink font-medium">{authUser.username}</span>
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
              className="hidden sm:inline-flex h-8 px-3 rounded-[var(--radius-control)] border border-hairline bg-surface text-ink-muted text-xs font-medium hover:bg-raised hover:text-ink transition-colors"
            >
              Logout
            </button>
          </>
        ) : (
          <Link
            href={`/login?next=${encodeURIComponent(`/r/${roomId}`)}`}
            className="h-8 px-3 rounded-[var(--radius-control)] border border-hairline bg-surface text-ink text-xs font-medium hover:bg-raised transition-colors inline-flex items-center"
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
          className={`h-8 inline-flex items-center gap-1.5 px-2.5 sm:px-3 rounded-[var(--radius-control)] border text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            isSaved
              ? "border-accent bg-accent-tint text-accent hover:bg-accent-soft"
              : "border-hairline bg-surface text-ink hover:bg-raised"
          }`}
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
          <svg
            className="w-3.5 h-3.5"
            viewBox="0 0 24 24"
            fill={isSaved ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M11.48 3.499a.75.75 0 011.04 0l2.84 2.751 3.83.557a.75.75 0 01.41 1.28l-2.77 2.7.65 3.81a.75.75 0 01-1.09.79L12 13.51l-3.39 1.78a.75.75 0 01-1.09-.79l.65-3.81-2.77-2.7a.75.75 0 01.41-1.28l3.83-.557 2.84-2.751z" />
          </svg>
          <span className="hidden sm:inline">
            {saveBusy ? "…" : isSaved ? "Saved" : "Save"}
          </span>
        </button>

        {saveError && (
          <span className="text-xs text-negative">{saveError}</span>
        )}

        <button
          type="button"
          onClick={onOpenWheel}
          disabled={passwordRequired}
          className="h-8 inline-flex items-center gap-1.5 px-2.5 sm:px-3 rounded-[var(--radius-control)] border border-hairline bg-surface text-ink text-xs font-medium hover:bg-raised transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title={
            passwordRequired ? "Join with password first" : "Open wheel picker"
          }
        >
          <svg
            className="w-3.5 h-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4" />
          </svg>
          <span className="hidden md:inline">Wheel</span>
        </button>

        <button
          type="button"
          onClick={onOpenPlaylist}
          disabled={passwordRequired}
          className={`h-8 inline-flex items-center gap-1.5 px-2.5 sm:px-3 rounded-[var(--radius-control)] border text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            isPlaylistOpen
              ? "border-accent bg-accent-soft text-accent ring-1 ring-accent"
              : "border-hairline bg-surface text-ink hover:bg-raised"
          }`}
          title={
            passwordRequired
              ? "Join with password first"
              : "Toggle playlist panel"
          }
        >
          <svg
            className="w-3.5 h-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 6h13M3 12h13M3 18h9M17 14l5 3-5 3v-6z" />
          </svg>
          <span className="hidden md:inline">Playlist</span>
        </button>

        <button
          type="button"
          onClick={onCopyInvite}
          className={`h-8 inline-flex items-center gap-1.5 px-2.5 sm:px-3 rounded-[var(--radius-control)] border text-xs font-medium transition-colors ${
            copied
              ? "border-positive bg-positive-soft text-positive"
              : "border-hairline bg-surface text-ink hover:bg-raised"
          }`}
          title={inviteLink || ""}
        >
          {copied ? (
            <svg
              className="w-3.5 h-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
          ) : (
            <svg
              className="w-3.5 h-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10 13a5 5 0 007.07 0l3-3a5 5 0 00-7.07-7.07l-1 1" />
              <path d="M14 11a5 5 0 00-7.07 0l-3 3a5 5 0 007.07 7.07l1-1" />
            </svg>
          )}
          <span className="hidden md:inline">
            {copied ? "Copied" : "Copy invite"}
          </span>
        </button>

        {/*
          Lives in the header, not in the player controls, because the player
          is hidden in chat-only mode — a toggle inside it would be a one-way
          door out of the room's video.
        */}
        <button
          type="button"
          onClick={onToggleChatOnlyMode}
          disabled={passwordRequired}
          aria-pressed={isChatOnlyMode}
          className={`h-8 inline-flex items-center gap-1.5 px-2.5 sm:px-3 rounded-[var(--radius-control)] border text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            isChatOnlyMode
              ? "border-positive bg-positive-soft text-positive hover:bg-positive-soft"
              : "border-hairline bg-surface text-ink hover:bg-raised"
          }`}
          title={
            passwordRequired
              ? "Join with password first"
              : isChatOnlyMode
                ? "Show the video again"
                : "Hide the video and just chat — sound keeps playing"
          }
        >
          <svg
            className="w-3.5 h-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span className="hidden lg:inline">
            {isChatOnlyMode ? "Chat only" : "Chat mode"}
          </span>
        </button>

        <ThemeToggle />

        <TimerWidget {...timerWidgetProps} />

        <button
          type="button"
          onClick={onOpenTimer}
          disabled={passwordRequired}
          className="h-8 inline-flex items-center gap-1.5 px-2.5 sm:px-3 rounded-[var(--radius-control)] border border-hairline bg-surface text-ink text-xs font-medium hover:bg-raised transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title={passwordRequired ? "Join with password first" : "Open timer"}
        >
          <svg
            className="w-3.5 h-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="13" r="8" />
            <path d="M12 9v4l2.5 2M9 2h6" />
          </svg>
          <span className="hidden lg:inline">Timer</span>
        </button>

        {isHost && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="h-8 inline-flex items-center gap-1.5 px-2.5 sm:px-3 rounded-[var(--radius-control)] border border-accent bg-accent-soft text-accent text-xs font-medium hover:bg-accent-soft transition-colors"
            title="Room settings"
          >
            <svg
              className="w-3.5 h-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33h0a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51h0a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v0a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
            <span className="hidden lg:inline">Settings</span>
          </button>
        )}

        {hasRoomPassword && (
          <span
            className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium bg-accent-tint px-2.5 py-1 rounded-full border border-accent text-accent"
            title="This room is password-protected"
          >
            <svg
              className="w-3 h-3"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="4" y="11" width="16" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 018 0v4" />
            </svg>
            Locked
          </span>
        )}

        <div
          className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
            isConnected
              ? "bg-positive-soft border-positive text-positive"
              : "bg-negative-soft border-negative text-negative"
          }`}
          title={
            isConnected
              ? "Connected to room server"
              : reconnectAttempt > 0
                ? `Reconnecting (${reconnectAttempt}/5)`
                : "Disconnected"
          }
        >
          <div className="relative shrink-0">
            <div
              className={`w-2 h-2 rounded-full ${
                isConnected ? "bg-positive" : "bg-negative"
              }`}
            />
          </div>
          <span className="hidden sm:inline">
            {isConnected
              ? "Live"
              : reconnectAttempt > 0
                ? `Reconnecting…`
                : "Offline"}
          </span>
        </div>
      </div>
    </header>
  );
}
