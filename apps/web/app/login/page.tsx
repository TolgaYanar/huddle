"use client";

import React, { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { apiLogin } from "../lib/api";
import { PasswordToggleButton } from "../components/PasswordToggleButton";

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";

  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const canSubmit =
    username.trim().length >= 3 && password.length >= 1 && !loading;

  const getErrorMessage = (err: unknown): string => {
    if (err && typeof err === "object" && "code" in err) {
      const code = (err as { code?: string }).code;
      if (code === "invalid_credentials") {
        return "Invalid username or password. Please check and try again.";
      }
      if (code === "db_unavailable") {
        return "Server is temporarily unavailable. Please try again later.";
      }
    }
    if (err && typeof err === "object" && "message" in err) {
      return String((err as { message?: unknown }).message);
    }
    return "Login failed. Please try again.";
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0a0a0f] text-slate-200 overflow-hidden">
      {/* Background glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-150 h-150 rounded-full bg-indigo-600/10 blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-100 h-100 rounded-full bg-violet-600/8 blur-[100px]" />
      </div>

      <header className="relative z-10 h-16 flex items-center justify-between px-6 lg:px-8 border-b border-white/6 backdrop-blur-md bg-black/20">
        <Link
          href="/"
          className="font-semibold text-lg sm:text-xl flex items-center gap-2.5 text-white tracking-tight"
        >
          <picture>
            <source srcSet="/favicon.svg?v=2" type="image/svg+xml" />
            <img
              src="/favicon.svg?v=2"
              alt="WeHuddle"
              width={26}
              height={26}
              className="h-6 w-6 rounded-md"
            />
          </picture>
          <span>WeHuddle</span>
        </Link>
        <Link
          href={`/register?next=${encodeURIComponent(next)}`}
          className="h-8 px-4 rounded-lg border border-white/8 bg-white/4 text-slate-300 text-xs font-medium hover:bg-white/8 hover:text-white transition-all flex items-center"
        >
          Register
        </Link>
      </header>

      <main className="relative z-10 flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          {/* Card */}
          <div className="rounded-2xl border border-white/8 bg-white/3 backdrop-blur-xl shadow-2xl shadow-black/40 p-7">
            {/* Header */}
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-9 w-9 rounded-xl bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center">
                  <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
              </div>
              <h1 className="text-xl font-semibold text-white tracking-tight">Welcome back</h1>
              <p className="text-sm text-slate-400 mt-1">Log in to access your saved rooms.</p>
            </div>

            <form
              className="grid gap-4"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!canSubmit) return;

                setError(null);
                setLoading(true);
                try {
                  await apiLogin(username.toLowerCase().trim(), password);
                  router.refresh();
                  router.push(next);
                } catch (err) {
                  setError(getErrorMessage(err));
                } finally {
                  setLoading(false);
                }
              }}
            >
              {/* Username field */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400">Username</label>
                <input
                  value={username}
                  onChange={(e) => {
                    setUsername(
                      e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "")
                    );
                    setError(null);
                  }}
                  placeholder="Your Username"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="w-full bg-white/4 border border-white/8 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500/35 hover:border-white/12 transition-all"
                />
              </div>

              {/* Password field */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400">Password</label>
                <div className="relative">
                  <input
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError(null);
                    }}
                    placeholder="Enter your password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    className="w-full bg-white/4 border border-white/8 rounded-xl px-4 py-2.5 pr-10 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500/35 hover:border-white/12 transition-all"
                  />
                  <PasswordToggleButton show={showPassword} onToggle={() => setShowPassword((v) => !v)} />
                </div>
              </div>

              {error && (
                <div className="text-sm text-rose-300 bg-rose-500/8 border border-rose-500/20 rounded-xl px-4 py-3 flex items-start gap-2.5">
                  <svg
                    className="w-4 h-4 mt-0.5 shrink-0 text-rose-400"
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
                className={`h-11 w-full rounded-xl font-semibold text-sm transition-all mt-1 ${
                  canSubmit
                    ? "bg-indigo-600 text-white hover:bg-indigo-500 active:scale-[0.98] shadow-lg shadow-indigo-500/20"
                    : "bg-white/4 text-slate-600 border border-white/6 cursor-not-allowed"
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
                    Logging in…
                  </span>
                ) : (
                  "Log in"
                )}
              </button>
            </form>
          </div>

          {/* Footer link */}
          <p className="text-xs text-slate-500 text-center mt-5">
            Don&apos;t have an account?{" "}
            <Link
              href={`/register?next=${encodeURIComponent(next)}`}
              className="text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              Create one
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f] text-slate-200">
          <div className="text-sm text-slate-500">Loading…</div>
        </div>
      }
    >
      <LoginPageInner />
    </Suspense>
  );
}
