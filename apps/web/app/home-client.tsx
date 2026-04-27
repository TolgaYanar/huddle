"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

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
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
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
    <div className="min-h-screen flex flex-col bg-linear-to-b from-slate-900 via-slate-950 to-black text-slate-200">
      <header className="h-16 flex items-center justify-between px-6 lg:px-8 border-b border-white/10 backdrop-blur-md bg-black/30 sticky top-0 z-50">
        <div className="font-semibold text-lg sm:text-xl flex items-center gap-2 text-slate-50 tracking-tight">
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
        </div>

        <div className="flex items-center gap-2">
          {user ? (
            <>
              <div className="hidden sm:flex items-center gap-2 text-xs border border-white/10 bg-black/20 rounded-full px-3 py-1 text-slate-300">
                <span className="text-slate-400">@</span>
                <span className="text-slate-200">{user.username}</span>
              </div>
              <button
                type="button"
                className="h-8 px-3 rounded-lg border border-white/10 bg-white/5 text-slate-200 text-xs font-medium hover:bg-white/10 transition-colors"
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
                className="h-8 px-3 rounded-lg border border-white/10 bg-white/5 text-slate-200 text-xs font-medium hover:bg-white/10 transition-colors"
              >
                Log in
              </Link>
              <Link
                href="/register"
                className="h-8 px-3 rounded-lg border border-white/10 bg-white/5 text-slate-200 text-xs font-medium hover:bg-white/10 transition-colors"
              >
                Register
              </Link>
            </>
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-6 gap-10">
        <div className="w-full max-w-xl">
          <div className="backdrop-blur-md bg-white/5 rounded-2xl border border-white/10 p-5 sm:p-6">
            <h1 className="font-semibold text-slate-50 text-xl">
              Watch videos together in sync
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Create a private room, share the link, and hit play together.
            </p>

            <div className="mt-5 grid gap-3">
              {roomHistory.length > 0 && (
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-slate-300">Recent rooms</span>
                    <button
                      type="button"
                      onClick={() => {
                        clearRoomHistory();
                        setRoomHistory([]);
                      }}
                      className="text-xs text-slate-600 hover:text-slate-400 transition-colors"
                      aria-label="Clear recent rooms"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="grid gap-1.5">
                    {roomHistory.slice(0, 5).map((r) => {
                      const savedEntry = savedRooms.find((s) => s.roomId === r.roomId);
                      return (
                        <button
                          key={r.roomId}
                          type="button"
                          className="w-full rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-left px-3 py-2 flex items-center gap-3"
                          onClick={() => router.push(`/r/${r.roomId}`)}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-slate-100 truncate">
                              {r.name ?? <span className="font-mono text-slate-300">{r.roomId}</span>}
                            </div>
                            {r.name && (
                              <div className="text-xs text-slate-500 font-mono truncate">{r.roomId}</div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {savedEntry && (
                              <span className="text-xs text-indigo-300">Saved</span>
                            )}
                            <span className="text-xs text-slate-500">{timeAgo(r.visitedAt)}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {roomHistory.length === 0 && user && savedRooms.length > 0 && (
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="text-xs font-medium text-slate-300 mb-2">Saved rooms</div>
                  <div className="grid gap-1.5">
                    {savedRooms.slice(0, 5).map((r) => (
                      <button
                        key={r.roomId}
                        type="button"
                        className="h-10 w-full rounded-xl font-medium text-sm transition-colors bg-white/5 border border-white/10 hover:bg-white/10 text-slate-50 text-left px-4"
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
                className="h-11 w-full rounded-xl font-semibold text-sm transition-colors bg-slate-50 text-slate-950 hover:bg-slate-50/90"
                onClick={() => {
                  router.push(`/r/${generateRoomId()}`);
                }}
              >
                Create a new room
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
                  placeholder="Enter room name or paste invite link (/r/...)"
                  className="flex-1 bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/40 transition"
                />
                <button
                  type="button"
                  className="h-11 px-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!normalizedJoin}
                  onClick={() => {
                    if (!normalizedJoin) return;
                    router.push(`/r/${normalizedJoin}`);
                  }}
                >
                  Join
                </button>
              </div>

              <div className="text-xs text-slate-500">
                Tip: share a room by sending its URL (e.g.{" "}
                <span className="font-mono">/r/neon-penguin-42</span>). No
                account required.
              </div>
            </div>
          </div>
        </div>

        {/* Features section */}
        <div className="w-full max-w-xl grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            {
              icon: (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.91 11.672a.375.375 0 010 .656l-5.603 3.113a.375.375 0 01-.557-.328V8.887c0-.286.307-.466.557-.328l5.603 3.113z" />
                </svg>
              ),
              title: "Perfectly in sync",
              description: "Play, pause, and seek together in real time across YouTube, Twitch, Vimeo, and more.",
            },
            {
              icon: (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                </svg>
              ),
              title: "Live chat",
              description: "Chat with everyone in the room while watching. Messages sync instantly.",
            },
            {
              icon: (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
                </svg>
              ),
              title: "Video & voice calls",
              description: "See and hear your friends while watching. No downloads required.",
            },
          ].map(({ icon, title, description }) => (
            <div
              key={title}
              className="backdrop-blur-md bg-white/5 rounded-2xl border border-white/10 p-4 flex flex-col gap-2"
            >
              <div className="text-indigo-400">{icon}</div>
              <div className="text-sm font-medium text-slate-200">{title}</div>
              <div className="text-xs text-slate-400 leading-relaxed">{description}</div>
            </div>
          ))}
        </div>
      </main>

      <footer className="py-4 px-6 border-t border-white/5 flex items-center justify-center gap-4 text-xs text-slate-500">
        <Link href="/privacy" className="hover:text-slate-300 transition-colors">Privacy Policy</Link>
        <span>·</span>
        <span>© {CURRENT_YEAR} WeHuddle</span>
      </footer>
    </div>
  );
}
