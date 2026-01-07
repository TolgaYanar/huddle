import React from "react";
import Link from "next/link";

interface PasswordModalProps {
  passwordRequired: boolean;
  passwordInput: string;
  setPasswordInput: (value: string) => void;
  passwordError: string | null;
  submitRoomPassword: () => void;
}

export function PasswordModal({
  passwordRequired,
  passwordInput,
  setPasswordInput,
  passwordError,
  submitRoomPassword,
}: PasswordModalProps) {
  if (!passwordRequired) return null;

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center px-6">
      <div className="absolute inset-0 bg-black" />
      <div className="relative w-full max-w-lg rounded-2xl border border-white/10 bg-black/80 p-6 shadow-xl">
        <div className="text-xl font-semibold text-slate-50">Room password</div>
        <div className="mt-2 text-sm text-slate-300">
          {passwordError ?? "This room requires a password."}
        </div>

        <div className="mt-5">
          <input
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            placeholder="Enter password"
            type="password"
            className="h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-base text-slate-100 placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-white/10"
          />
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={submitRoomPassword}
              className="h-11 px-5 rounded-xl border border-white/10 bg-white/5 text-slate-100 text-sm font-medium hover:bg-white/10 transition-colors"
              disabled={!passwordInput.trim()}
            >
              Join
            </button>
            <Link
              href="/"
              className="h-11 px-5 inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-100 text-sm font-medium hover:bg-white/10 transition-colors"
            >
              Go home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
