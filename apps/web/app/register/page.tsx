"use client";

import React, { Suspense } from "react";
import Link from "next/link";

import { ThemeToggle } from "../components/ThemeToggle";
import { useRouter, useSearchParams } from "next/navigation";

import { apiRegister } from "../lib/api";
import { PasswordToggleButton } from "../components/PasswordToggleButton";

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
    label: "Letters, numbers, underscore only",
    test: (u: string) => /^[a-z0-9_]*$/.test(u),
  },
];

function RequirementCheck({ met, label }: { met: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <div
        className={`w-4 h-4 rounded flex items-center justify-center transition-colors shrink-0 ${
          met
            ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-400"
            : "bg-surface border border-hairline text-ink-faint"
        }`}
      >
        {met ? (
          <svg
            className="w-2.5 h-2.5"
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
      <span className={met ? "text-emerald-400" : "text-ink-faint"}>
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
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);
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
      if (code === "db_unavailable") {
        return "Server is temporarily unavailable. Please try again later.";
      }
    }
    if (err && typeof err === "object" && "message" in err) {
      return String((err as { message?: unknown }).message);
    }
    return "Registration failed. Please try again.";
  };

  return (
    <div className="min-h-screen flex flex-col bg-bg text-ink overflow-hidden">
      <header className="relative z-10 h-16 flex items-center justify-between px-6 lg:px-8 border-b border-hairline bg-bg">
        <Link
          href="/"
          className="font-semibold text-lg sm:text-xl flex items-center gap-2.5 text-ink tracking-tight"
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
          href={`/login?next=${encodeURIComponent(next)}`}
          className="h-8 px-4 rounded-[var(--radius-control)] border border-hairline bg-surface text-ink-muted text-xs font-medium hover:bg-white/8 hover:text-ink transition-all flex items-center"
        >
          Log in
        </Link>
        <ThemeToggle />
      </header>

      <main className="relative z-10 flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          {/* Card */}
          <div className="panel shadow-2xl shadow-black/40 p-7">
            {/* Header */}
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-9 w-9 rounded-[var(--radius-control)] bg-accent-tint border border-accent flex items-center justify-center">
                  <svg
                    className="w-4 h-4 text-accent"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                    />
                  </svg>
                </div>
              </div>
              <h1 className="text-xl font-semibold text-ink tracking-tight">
                Create an account
              </h1>
              <p className="text-sm text-ink-muted mt-1">
                Join WeHuddle to save your rooms and sync across devices.
              </p>
            </div>

            <form
              className="grid gap-4"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!canSubmit) return;

                setError(null);
                setLoading(true);
                try {
                  await apiRegister(username.toLowerCase(), password);
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
                <label
                  htmlFor="register-username"
                  className="text-xs font-medium text-ink-muted"
                >
                  Username
                </label>
                <input
                  id="register-username"
                  value={username}
                  onChange={(e) => {
                    setUsername(
                      e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""),
                    );
                    setError(null);
                  }}
                  placeholder="Your Username"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  autoFocus
                  className={`w-full bg-surface border rounded-[var(--radius-control)] px-4 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 transition-all hover:border-hairline ${
                    username.length > 0
                      ? usernameValid
                        ? "border-emerald-500/35 focus:ring-emerald-500/20"
                        : "border-rose-500/35 focus:ring-rose-500/20"
                      : "border-hairline focus:ring-accent focus:border-accent"
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
              <div className="space-y-1.5">
                <label
                  htmlFor="register-password"
                  className="text-xs font-medium text-ink-muted"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="register-password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setShowRequirements(true);
                      setError(null);
                    }}
                    onFocus={() => setShowRequirements(true)}
                    placeholder="Create a strong password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    className={`w-full bg-surface border rounded-[var(--radius-control)] px-4 py-2.5 pr-10 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 transition-all hover:border-hairline ${
                      password.length > 0
                        ? passwordValid
                          ? "border-emerald-500/35 focus:ring-emerald-500/20"
                          : "border-amber-500/35 focus:ring-amber-500/20"
                        : "border-hairline focus:ring-accent focus:border-accent"
                    }`}
                  />
                  <PasswordToggleButton
                    show={showPassword}
                    onToggle={() => setShowPassword((v) => !v)}
                  />
                </div>
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
              <div className="space-y-1.5">
                <label
                  htmlFor="register-confirm-password"
                  className="text-xs font-medium text-ink-muted"
                >
                  Confirm Password
                </label>
                <div className="relative">
                  <input
                    id="register-confirm-password"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      setError(null);
                    }}
                    placeholder="Confirm your password"
                    type={showConfirmPassword ? "text" : "password"}
                    autoComplete="new-password"
                    className={`w-full bg-surface border rounded-[var(--radius-control)] px-4 py-2.5 pr-10 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 transition-all hover:border-hairline ${
                      confirmPassword.length > 0
                        ? passwordsMatch
                          ? "border-emerald-500/35 focus:ring-emerald-500/20"
                          : "border-rose-500/35 focus:ring-rose-500/20"
                        : "border-hairline focus:ring-accent focus:border-accent"
                    }`}
                  />
                  <PasswordToggleButton
                    show={showConfirmPassword}
                    onToggle={() => setShowConfirmPassword((v) => !v)}
                  />
                </div>
                {confirmPassword.length > 0 && !passwordsMatch && (
                  <p className="text-xs text-negative mt-1">
                    Passwords do not match
                  </p>
                )}
                {confirmPassword.length > 0 && passwordsMatch && (
                  <p className="text-xs text-emerald-400 mt-1 flex items-center gap-1">
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
                  </p>
                )}
              </div>

              {error && (
                <div className="text-sm text-negative bg-rose-500/8 border border-rose-500/20 rounded-[var(--radius-control)] px-4 py-3 flex items-start gap-2.5">
                  <svg
                    className="w-4 h-4 mt-0.5 shrink-0 text-negative"
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
                className={`h-11 w-full rounded-[var(--radius-control)] font-semibold text-sm transition-all mt-1 ${
                  canSubmit
                    ? "bg-accent text-accent-ink hover:bg-accent  "
                    : "bg-surface text-ink-faint border border-hairline cursor-not-allowed"
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
            </form>
          </div>

          {/* Footer link */}
          <p className="text-xs text-ink-faint text-center mt-5">
            Already have an account?{" "}
            <Link
              href={`/login?next=${encodeURIComponent(next)}`}
              className="text-accent hover:text-accent transition-colors"
            >
              Log in
            </Link>
          </p>
          <p className="text-xs text-ink-faint text-center mt-3">
            By creating an account you agree to our{" "}
            <Link
              href="/terms"
              className="text-ink-faint hover:text-ink-muted transition-colors"
            >
              Terms
            </Link>
            .
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
        <div className="min-h-screen flex items-center justify-center bg-bg text-ink">
          <div className="text-sm text-ink-faint">Loading…</div>
        </div>
      }
    >
      <RegisterPageInner />
    </Suspense>
  );
}
