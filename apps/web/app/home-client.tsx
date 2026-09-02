"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { ThemeToggle } from "./components/ThemeToggle";

import {
  apiAuthMe,
  apiListSavedRooms,
  apiLogout,
  type AuthUser,
} from "./lib/api";
import {
  clearRoomHistory,
  readRoomHistory,
  type RoomHistoryEntry,
} from "./lib/roomHistory";

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "yesterday";
  if (day < 7) return `${day}d ago`;
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function generateRoomId() {
  // Friendly, URL-safe, reasonably unique (no server round-trip needed)
  const alphabet = "23456789abcdefghjkmnpqrstuvwxyz";
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => alphabet[b % alphabet.length])
    .join("");
}

function normalizeRoomId(input: string) {
  const raw = input.trim();
  if (!raw) return "";

  // Accept full invite links too (e.g. http://host:3002/r/abc123)
  const match = raw.match(/\/r\/([^/?#]+)/i);
  const extracted = match?.[1] ? decodeURIComponent(match[1]) : raw;

  const trimmed = extracted.trim().toLowerCase();
  // keep only url-safe chars; collapse whitespace/invalids to '-'
  const cleaned = trimmed.replace(/[^a-z0-9_-]+/g, "-").replace(/-+/g, "-");
  return cleaned.replace(/^-+|-+$/g, "");
}

const CURRENT_YEAR = new Date().getFullYear();

export function HomeClient() {
  const router = useRouter();
  const [joinValue, setJoinValue] = useState("");
  const [roomHistory, setRoomHistory] = useState<RoomHistoryEntry[]>([]);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [savedRooms, setSavedRooms] = useState<
    Array<{ roomId: string; createdAt: string }>
  >([]);
  const normalizedJoin = normalizeRoomId(joinValue);

  useEffect(() => {
    setRoomHistory(readRoomHistory());
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiAuthMe()
      .then((r) => {
        if (cancelled) return;
        setUser(r.user);
      })
      .catch(() => {
        if (cancelled) return;
        setUser(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setSavedRooms([]);
      return;
    }
    apiListSavedRooms()
      .then((r) => {
        if (cancelled) return;
        setSavedRooms(r.rooms);
      })
      .catch(() => {
        if (cancelled) return;
        setSavedRooms([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <div className="relative min-h-screen flex flex-col bg-bg text-ink overflow-x-hidden">
      <header className="relative z-10 h-16 flex items-center justify-between px-4 sm:px-6 lg:px-8 border-b border-hairline bg-bg sticky top-0">
        <div className="font-semibold text-lg sm:text-xl flex items-center gap-2 text-ink tracking-tight group">
          <picture>
            <source srcSet="/favicon.svg?v=2" type="image/svg+xml" />
            <img
              src="/favicon.svg?v=2"
              alt="WeHuddle"
              width={24}
              height={24}
              className="h-6 w-6 rounded transition-transform group-hover:scale-110 group-hover:rotate-6"
            />
          </picture>
          <span className="font-serif font-normal text-[1.35em] leading-none">
            WeHuddle
          </span>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          {user ? (
            <>
              <div className="hidden sm:flex items-center gap-1.5 text-xs border border-hairline bg-sunken rounded-full px-3 py-1 text-ink-muted">
                <span className="text-ink-faint">@</span>
                <span className="text-ink font-medium">{user.username}</span>
              </div>
              <button
                type="button"
                className="h-8 px-3 rounded-[var(--radius-control)] border border-hairline bg-surface text-ink-muted text-xs font-medium hover:bg-raised hover:text-ink transition-colors"
                onClick={async () => {
                  try {
                    await apiLogout();
                  } finally {
                    setUser(null);
                    setSavedRooms([]);
                  }
                }}
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="h-8 px-3 rounded-[var(--radius-control)] border border-hairline bg-surface text-ink text-xs font-medium hover:bg-raised transition-colors inline-flex items-center"
              >
                Log in
              </Link>
              <Link
                href="/register"
                className="h-8 px-3 rounded-[var(--radius-control)] border border-accent bg-accent-soft text-accent text-xs font-medium hover:bg-accent-soft transition-colors inline-flex items-center"
              >
                Register
              </Link>
            </>
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-10 sm:py-16 gap-12">
        {/* Hero */}
        <div className="w-full max-w-2xl flex flex-col items-center text-center gap-3">
          <span className="inline-flex items-center gap-2 text-xs font-medium text-ink-muted">
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full bg-positive"
            />
            No install, no account
          </span>
          <h1 className="font-serif font-normal text-ink text-5xl sm:text-6xl lg:text-7xl tracking-[-0.02em] leading-[0.98] text-balance">
            Watch together,
            <br />
            in sync to the frame.
          </h1>
          <p className="text-base text-ink-muted max-w-md text-pretty">
            Create a private room, share the link, hit play. Voice and video
            chat, reactions and games come with it.
          </p>
        </div>

        <div className="w-full max-w-xl">
          <div className="relative panel p-5 sm:p-6">
            <div className="relative">
              <h2 className="font-semibold text-ink text-lg">
                Start a watch party
              </h2>
              <p className="text-sm text-ink-muted mt-1">
                Create a private room, share the link, and hit play together.
              </p>

              <div className="mt-5 grid gap-3">
                {roomHistory.length > 0 && (
                  <div className="rounded-[var(--radius-control)] border border-hairline bg-sunken p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-ink-muted">
                        Recent rooms
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          clearRoomHistory();
                          setRoomHistory([]);
                        }}
                        className="text-xs text-ink-faint hover:text-ink-muted transition-colors"
                        aria-label="Clear recent rooms"
                      >
                        Clear
                      </button>
                    </div>
                    <div className="grid gap-1.5">
                      {roomHistory.slice(0, 5).map((r) => {
                        const savedEntry = savedRooms.find(
                          (s) => s.roomId === r.roomId,
                        );
                        return (
                          <button
                            key={r.roomId}
                            type="button"
                            className="group/item w-full rounded-[var(--radius-control)] bg-surface border border-hairline hover:bg-raised hover:border-hairline-strong transition-colors text-left px-3 py-2 flex items-center gap-3"
                            onClick={() => router.push(`/r/${r.roomId}`)}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-ink truncate">
                                {r.name ?? (
                                  <span className="font-mono text-ink-muted">
                                    {r.roomId}
                                  </span>
                                )}
                              </div>
                              {r.name && (
                                <div className="text-xs text-ink-faint font-mono truncate">
                                  {r.roomId}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {savedEntry && (
                                <span className="inline-flex items-center gap-1 text-[10px] text-amber-300 font-medium px-1.5 py-0.5 rounded-full bg-amber-400/10 border border-amber-400/30">
                                  <svg
                                    className="w-2.5 h-2.5"
                                    fill="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path d="M11.48 3.499a.75.75 0 011.04 0l2.84 2.751 3.83.557a.75.75 0 01.41 1.28l-2.77 2.7.65 3.81a.75.75 0 01-1.09.79L12 13.51l-3.39 1.78a.75.75 0 01-1.09-.79l.65-3.81-2.77-2.7a.75.75 0 01.41-1.28l3.83-.557 2.84-2.751z" />
                                  </svg>
                                  Saved
                                </span>
                              )}
                              <span className="text-xs text-ink-faint">
                                {timeAgo(r.visitedAt)}
                              </span>
                              <span className="text-ink-faint group-hover/item:text-ink-muted group-hover/item:translate-x-0.5 transition-all">
                                →
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {roomHistory.length === 0 && user && savedRooms.length > 0 && (
                  <div className="rounded-[var(--radius-control)] border border-hairline bg-sunken p-3">
                    <div className="text-xs font-medium text-ink-muted mb-2">
                      Saved rooms
                    </div>
                    <div className="grid gap-1.5">
                      {savedRooms.slice(0, 5).map((r) => (
                        <button
                          key={r.roomId}
                          type="button"
                          className="h-10 w-full rounded-[var(--radius-control)] font-medium text-sm transition-colors bg-surface border border-hairline hover:bg-raised text-ink text-left px-4"
                          onClick={() => router.push(`/r/${r.roomId}`)}
                        >
                          <span className="font-mono">{r.roomId}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  className="group relative h-12 w-full rounded-[var(--radius-control)] font-semibold text-sm transition-colors duration-150 bg-accent text-accent-ink hover:brightness-110 inline-flex items-center justify-center gap-2"
                  onClick={() => {
                    router.push(`/r/${generateRoomId()}`);
                  }}
                >
                  <svg
                    className="w-4 h-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.25}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  Create a new room
                  {/*
                    Sits on the accent fill, so it takes the accent's own ink at
                    full strength. The muted body colour is a page-background
                    token and vanished here; dimming with opacity only moved the
                    problem, so the secondary weight comes from size instead.
                  */}
                  <span className="text-accent-ink font-normal text-xs ml-1 hidden sm:inline">
                    (instant link)
                  </span>
                </button>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={joinValue}
                    onChange={(e) => setJoinValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && normalizedJoin) {
                        router.push(`/r/${normalizedJoin}`);
                      }
                    }}
                    placeholder="Enter room name or paste invite link…"
                    aria-label="Room name or invite link"
                    className="flex-1 min-w-0 bg-sunken border border-hairline rounded-[var(--radius-control)] px-4 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:border-accent hover:border-hairline-strong transition-colors duration-150"
                  />
                  <button
                    type="button"
                    className={`h-11 px-5 rounded-[var(--radius-control)] border text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5 ${
                      normalizedJoin
                        ? "border-indigo-500/50 bg-indigo-500/20 text-indigo-100 hover:bg-indigo-500/30"
                        : "border-hairline bg-surface text-ink-muted hover:bg-raised"
                    }`}
                    disabled={!normalizedJoin}
                    onClick={() => {
                      if (!normalizedJoin) return;
                      router.push(`/r/${normalizedJoin}`);
                    }}
                  >
                    Join
                    <svg
                      className="w-3.5 h-3.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </button>
                </div>

                <div className="text-xs text-ink-faint">
                  Tip: share a room by sending its URL (e.g.{" "}
                  <span className="font-mono">/r/neon-penguin-42</span>). No
                  account required.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Features section */}
        <div className="w-full max-w-2xl grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            {
              icon: (
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.91 11.672a.375.375 0 010 .656l-5.603 3.113a.375.375 0 01-.557-.328V8.887c0-.286.307-.466.557-.328l5.603 3.113z"
                  />
                </svg>
              ),
              title: "Perfectly in sync",
              description:
                "Play, pause, and seek together in real time across YouTube, Twitch, Vimeo, and more.",
            },
            {
              icon: (
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"
                  />
                </svg>
              ),
              title: "Live chat",
              description:
                "Chat with everyone in the room while watching. Messages sync instantly.",
            },
            {
              icon: (
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z"
                  />
                </svg>
              ),
              title: "Video & voice calls",
              description:
                "See and hear your friends while watching. No downloads required.",
            },
          ].map(({ icon, title, description }, i) => (
            <div
              key={title}
              className={`flex flex-col gap-2 py-4 sm:py-0 sm:px-6 first:sm:pl-0 last:sm:pr-0 border-t border-hairline sm:border-t-0 first:border-t-0 ${
                i > 0 ? "sm:border-l sm:border-hairline" : ""
              }`}
            >
              <div className="text-accent">{icon}</div>
              <div className="text-sm font-semibold text-ink">{title}</div>
              <div className="text-sm text-ink-muted leading-relaxed text-pretty">
                {description}
              </div>
            </div>
          ))}
        </div>
      </main>

      <footer className="py-5 px-6 border-t border-white/5 flex items-center justify-center gap-4 text-xs text-ink-faint">
        <Link
          href="/privacy"
          className="hover:text-ink-muted transition-colors"
        >
          Privacy Policy
        </Link>
        <span className="text-ink-faint">·</span>
        <Link href="/terms" className="hover:text-ink-muted transition-colors">
          Terms
        </Link>
        <span className="text-ink-faint">·</span>
        <span>© {CURRENT_YEAR} WeHuddle</span>
      </footer>
    </div>
  );
}
