"use client";

import React, { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { apiRegister } from "../lib/api";

// Password requirements
const PASSWORD_REQUIREMENTS = [
  {
    id: "length",
    label: "At least 8 characters",
    test: (pw: string) => pw.length >= 8,
  },
  {
    id: "lowercase",
    label: "One lowercase letter",
    test: (pw: string) => /[a-z]/.test(pw),
  },
  {
    id: "uppercase",
    label: "One uppercase letter",
    test: (pw: string) => /[A-Z]/.test(pw),
  },
  { id: "number", label: "One number", test: (pw: string) => /\d/.test(pw) },
];

// Username requirements
const USERNAME_REQUIREMENTS = [
  {
    id: "length",
    label: "3–20 characters",
    test: (u: string) => u.length >= 3 && u.length <= 20,
  },
  {
    id: "chars",
    label: "Only lowercase letters, numbers, underscore",
    test: (u: string) => /^[a-z0-9_]*$/.test(u),
  },
];

function RequirementCheck({ met, label }: { met: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <div
        className={`w-4 h-4 rounded flex items-center justify-center transition-colors ${
          met
            ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-400"
            : "bg-white/5 border border-white/10 text-slate-500"
        }`}
      >
        {met ? (
          <svg
            className="w-3 h-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={3}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        ) : null}
      </div>
      <span className={met ? "text-emerald-400" : "text-slate-500"}>
        {label}
      </span>
    </div>
  );
}

function RegisterPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";

  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [showRequirements, setShowRequirements] = React.useState(false);

  const usernameValid = USERNAME_REQUIREMENTS.every((r) => r.test(username));
  const passwordValid = PASSWORD_REQUIREMENTS.every((r) => r.test(password));
  const passwordsMatch =
    password === confirmPassword && confirmPassword.length > 0;
  const canSubmit =
    usernameValid && passwordValid && passwordsMatch && !loading;

  const getErrorMessage = (err: unknown): string => {
    if (err && typeof err === "object" && "code" in err) {
      const code = (err as { code?: string }).code;
      if (code === "username_taken") {
        return `Username "${username}" is already taken. Please choose a different one.`;
      }
      if (code === "invalid_username") {
        return "Username must be 3–20 characters with only lowercase letters, numbers, and underscores.";
      }
      if (code === "invalid_password") {
        return "Password does not meet the requirements.";
      }
    }
    if (err && typeof err === "object" && "message" in err) {
      return String((err as { message?: unknown }).message);
    }
    return "Registration failed. Please try again.";
  };

  return (
    <div className="min-h-screen flex flex-col bg-linear-to-b from-slate-900 via-slate-950 to-black text-slate-200">
      <header className="h-16 flex items-center justify-between px-6 lg:px-8 border-b border-white/10 backdrop-blur-md bg-black/30 sticky top-0 z-50">
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
        <Link
          href={`/login?next=${encodeURIComponent(next)}`}
          className="h-8 px-3 rounded-lg border border-white/10 bg-white/5 text-slate-200 text-xs font-medium hover:bg-white/10 transition-colors flex items-center"
        >
          Log in
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="backdrop-blur-md bg-white/5 rounded-2xl border border-white/10 p-5 sm:p-6">
            <div className="font-semibold text-slate-50 text-lg">
              Create an account
            </div>
            <div className="text-sm text-slate-400 mt-1">
              Join Huddle to save your rooms and sync across devices.
            </div>

            <form
              className="mt-5 grid gap-4"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!canSubmit) return;

                setError(null);
                setLoading(true);
                try {
                  await apiRegister(username.toLowerCase(), password);
                  router.push(next);
                } catch (err) {
                  setError(getErrorMessage(err));
                } finally {
                  setLoading(false);
                }
              }}
            >
              {/* Username field */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-300">
                  Username
                </label>
                <input
                  value={username}
                  onChange={(e) => {
                    setUsername(
                      e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "")
                    );
                    setError(null);
                  }}
                  placeholder="your_username"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className={`w-full bg-black/20 border rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 transition ${
                    username.length > 0
                      ? usernameValid
                        ? "border-emerald-500/40 focus:ring-emerald-500/30 focus:border-emerald-500/40"
                        : "border-rose-500/40 focus:ring-rose-500/30 focus:border-rose-500/40"
                      : "border-white/10 focus:ring-indigo-500/30 focus:border-indigo-500/40"
                  }`}
                />
                {username.length > 0 && (
                  <div className="grid gap-1 mt-2">
                    {USERNAME_REQUIREMENTS.map((req) => (
                      <RequirementCheck
                        key={req.id}
                        met={req.test(username)}
                        label={req.label}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Password field */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-300">
                  Password
                </label>
                <input
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setShowRequirements(true);
                    setError(null);
                  }}
                  onFocus={() => setShowRequirements(true)}
                  placeholder="Create a strong password"
                  type="password"
                  autoComplete="new-password"
                  className={`w-full bg-black/20 border rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 transition ${
                    password.length > 0
                      ? passwordValid
                        ? "border-emerald-500/40 focus:ring-emerald-500/30 focus:border-emerald-500/40"
                        : "border-amber-500/40 focus:ring-amber-500/30 focus:border-amber-500/40"
                      : "border-white/10 focus:ring-indigo-500/30 focus:border-indigo-500/40"
                  }`}
                />
                {showRequirements && (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
                    {PASSWORD_REQUIREMENTS.map((req) => (
                      <RequirementCheck
                        key={req.id}
                        met={req.test(password)}
                        label={req.label}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Confirm Password field */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-300">
                  Confirm Password
                </label>
                <input
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setError(null);
                  }}
                  placeholder="Confirm your password"
                  type="password"
                  autoComplete="new-password"
                  className={`w-full bg-black/20 border rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 transition ${
                    confirmPassword.length > 0
                      ? passwordsMatch
                        ? "border-emerald-500/40 focus:ring-emerald-500/30 focus:border-emerald-500/40"
                        : "border-rose-500/40 focus:ring-rose-500/30 focus:border-rose-500/40"
                      : "border-white/10 focus:ring-indigo-500/30 focus:border-indigo-500/40"
                  }`}
                />
                {confirmPassword.length > 0 && !passwordsMatch && (
                  <div className="text-xs text-rose-400 mt-1">
                    Passwords do not match
                  </div>
                )}
                {confirmPassword.length > 0 && passwordsMatch && (
                  <div className="text-xs text-emerald-400 mt-1 flex items-center gap-1">
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    Passwords match
                  </div>
                )}
              </div>

              {error && (
                <div className="text-sm text-rose-200 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 flex items-start gap-2">
                  <svg
                    className="w-4 h-4 mt-0.5 flex-shrink-0"
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
                  <span>{error}</span>
                </div>
              )}

              <button
                disabled={!canSubmit}
                className={`h-11 w-full rounded-xl font-semibold text-sm transition-all ${
                  canSubmit
                    ? "bg-indigo-600 text-white hover:bg-indigo-500 active:scale-[0.98]"
                    : "bg-slate-800 text-slate-500 cursor-not-allowed"
                }`}
                type="submit"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Creating account…
                  </span>
                ) : (
                  "Create account"
                )}
              </button>

              <div className="text-xs text-slate-500 text-center">
                Already have an account?{" "}
                <Link
                  href={`/login?next=${encodeURIComponent(next)}`}
                  className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
                >
                  Log in
                </Link>
              </div>
            </form>
          </div>

          <p className="text-xs text-slate-500 text-center mt-4">
            ⚠️ No password reset available yet. Please save your password
            safely.
          </p>
        </div>
      </main>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-linear-to-b from-slate-900 via-slate-950 to-black text-slate-200">
          <div className="text-sm text-slate-400">Loading…</div>
        </div>
      }
    >
      <RegisterPageInner />
    </Suspense>
  );
}
