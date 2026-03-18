"use client";

import React from "react";

interface Props {
  children: React.ReactNode;
  /**
   * Custom fallback. Accepts a static node or a render function that receives
   * the caught error — use the function form when the fallback needs to display
   * error details or a context-specific message.
   */
  fallback?: React.ReactNode | ((error: Error) => React.ReactNode);
  /** Called when an error is caught, e.g. for external error reporting. */
  onError?: (error: Error, info: React.ErrorInfo) => void;
}

interface State {
  error: Error | null;
}

/**
 * Class-based error boundary (React requires class components for this).
 * Wraps any subtree and renders a fallback instead of crashing the whole page.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.props.onError?.(error, info);
    // Keep a console trace in development.
    if (process.env.NODE_ENV !== "production") {
      console.error("[ErrorBoundary] Caught error:", error, info.componentStack);
    }
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      if (this.props.fallback !== undefined) {
        return typeof this.props.fallback === "function"
          ? this.props.fallback(this.state.error)
          : this.props.fallback;
      }

      return (
        <DefaultErrorFallback
          error={this.state.error}
          onReset={this.reset}
        />
      );
    }

    return this.props.children;
  }
}

function DefaultErrorFallback({
  error,
  onReset,
}: {
  error: Error;
  onReset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-200 p-6">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-6 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center flex-shrink-0">
            <svg
              className="w-5 h-5 text-rose-400"
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
          </div>
          <div>
            <div className="font-semibold text-slate-50 text-sm">
              Something went wrong
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              An unexpected error occurred.
            </div>
          </div>
        </div>

        {process.env.NODE_ENV !== "production" && (
          <pre className="text-xs text-rose-300 bg-rose-500/5 border border-rose-500/15 rounded-xl p-3 overflow-auto max-h-40 whitespace-pre-wrap break-all">
            {error.message}
          </pre>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onReset}
            className="flex-1 h-9 rounded-xl border border-white/10 bg-white/5 text-slate-100 text-sm font-medium hover:bg-white/10 transition-colors"
          >
            Try again
          </button>
          <a
            href="/"
            className="flex-1 h-9 rounded-xl border border-white/10 bg-white/5 text-slate-100 text-sm font-medium hover:bg-white/10 transition-colors flex items-center justify-center"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}
