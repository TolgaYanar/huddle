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

export default function Home() {
  const router = useRouter();
  const [joinValue, setJoinValue] = useState("");
  const [lastRoomId, setLastRoomId] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [savedRooms, setSavedRooms] = useState<
    Array<{ roomId: string; createdAt: string }>
  >([]);
  const normalizedJoin = normalizeRoomId(joinValue);

  useEffect(() => {
    try {
      const last = window.localStorage.getItem("huddle:lastRoomId");
      if (last) setLastRoomId(last);
    } catch {
      // ignore
    }
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
          <span aria-hidden className="text-xl">
            🍿
          </span>
          <span>Huddle</span>
        </div>

        <div className="flex items-center gap-2">
          {user ? (
            <>
              <div className="hidden sm:flex items-center gap-2 text-xs border border-white/10 bg-black/20 rounded-full px-3 py-1 text-slate-300">
                <span className="text-slate-400">@</span>
                <span className="text-slate-200">{user.username}</span>
              </div>
              <button
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

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-xl">
          <div className="backdrop-blur-md bg-white/5 rounded-2xl border border-white/10 p-5 sm:p-6">
            <div className="font-semibold text-slate-50 text-lg">
              Create or join a room
            </div>
            <div className="text-sm text-slate-400 mt-1">
              Rooms are just URLs you can share with friends.
            </div>

            <div className="mt-5 grid gap-3">
              {user && savedRooms.length > 0 && (
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="text-xs font-medium text-slate-300">
                    Saved rooms
                  </div>
                  <div className="mt-2 grid gap-2">
                    {savedRooms.slice(0, 5).map((r) => (
                      <button
                        key={r.roomId}
                        className="h-10 w-full rounded-xl font-medium text-sm transition-colors bg-white/5 border border-white/10 hover:bg-white/10 text-slate-50 text-left px-4"
                        onClick={() => router.push(`/r/${r.roomId}`)}
                        title={r.roomId}
                      >
                        <span className="font-mono">{r.roomId}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {lastRoomId && (
                <button
                  className="h-11 w-full rounded-xl font-semibold text-sm transition-colors bg-white/5 border border-white/10 hover:bg-white/10 text-slate-50"
                  onClick={() => {
                    router.push(`/r/${lastRoomId}`);
                  }}
                >
                  Continue last room
                </button>
              )}

              <button
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
                  placeholder="Enter room name or paste invite link (/r/...)"
                  className="flex-1 bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/40 transition"
                />
                <button
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
                <span className="font-mono">/r/neon-penguin-42</span>).
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
