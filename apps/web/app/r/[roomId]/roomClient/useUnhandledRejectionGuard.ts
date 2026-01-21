import { useEffect } from "react";

export function useUnhandledRejectionGuard() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason as
        | { name?: unknown; message?: unknown }
        | string
        | null
        | undefined;

      const message =
        typeof reason === "string"
          ? reason
          : typeof reason?.message === "string"
            ? reason.message
            : "";

      if (
        message.includes("play() request was interrupted by a call to pause")
      ) {
        event.preventDefault();
      }
    };

    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);
}
