"use client";

import React from "react";
import Link from "next/link";

import { Modal } from "../../../components/Modal";

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
  const trimmed = passwordInput.trim();
  const canSubmit = trimmed.length > 0;

  return (
    <Modal
      open={passwordRequired}
      // No-op: the only way out is "Go home" or submitting the password.
      onClose={() => {}}
      closeOnBackdrop={false}
      closeOnEscape={false}
      labelledBy="room-password-title"
      describedBy="room-password-description"
      panelClassName="w-full max-w-lg rounded-2xl border border-white/10 bg-black/80 p-6 shadow-xl"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!canSubmit) return;
          submitRoomPassword();
        }}
      >
        <h2 id="room-password-title" className="text-xl font-semibold text-slate-50">
          Room password
        </h2>
        <p id="room-password-description" className="mt-2 text-sm text-slate-300">
          {passwordError ?? "This room requires a password."}
        </p>

        <div className="mt-5">
          <label htmlFor="room-password-input" className="sr-only">
            Room password
          </label>
          <input
            id="room-password-input"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            placeholder="Enter password"
            type="password"
            autoComplete="off"
            autoFocus
            className="h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-base text-slate-100 placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-white/10"
          />
          <div className="mt-4 flex items-center gap-3">
            <button
              type="submit"
              className="h-11 px-5 rounded-xl border border-white/10 bg-white/5 text-slate-100 text-sm font-medium hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!canSubmit}
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
      </form>
    </Modal>
  );
}
