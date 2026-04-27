import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Privacy Policy for WeHuddle and the Huddle for Netflix extension.",
  alternates: {
    canonical: "/privacy",
  },
};

export default function PrivacyPolicyPage() {
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
          href="/"
          className="h-8 px-3 rounded-lg border border-white/10 bg-white/5 text-slate-200 text-xs font-medium hover:bg-white/10 transition-colors flex items-center"
        >
          Back to home
        </Link>
      </header>

      <main className="flex-1 mx-auto w-full max-w-3xl px-5 py-12">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-50">
            Privacy Policy
          </h1>
          <p className="mt-2 text-sm text-slate-400">Last updated: 2026-01-18</p>
        </header>

        <div className="space-y-8 text-slate-200">
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-100">
              1) What this product does
            </h2>
            <p>
              WeHuddle (including the “Huddle for Netflix” browser extension)
              helps users watch content together by synchronizing playback
              (e.g., play/pause/seek) and enabling room-based chat.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-100">
              2) Data we collect and process
            </h2>
            <p>When you use the service, we may process:</p>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                <span className="font-medium text-slate-100">
                  Room information
                </span>{" "}
                (e.g., the Room ID you enter).
              </li>
              <li>
                <span className="font-medium text-slate-100">
                  Playback sync events
                </span>{" "}
                (e.g., play, pause, seek actions and timestamps).
              </li>
              <li>
                <span className="font-medium text-slate-100">Page URL</span>{" "}
                (e.g., Netflix watch URL) to keep participants synchronized on
                the same title.
              </li>
              <li>
                <span className="font-medium text-slate-100">
                  Chat messages
                </span>{" "}
                you send in a room.
              </li>
              <li>
                <span className="font-medium text-slate-100">
                  Technical data
                </span>{" "}
                such as IP address and basic connection metadata for security,
                abuse prevention, and service reliability.
              </li>
            </ul>
            <p>
              We do <span className="font-medium text-slate-100">not</span>{" "}
              collect your Netflix credentials (username/password) or payment
              information.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-100">
              3) How we use data
            </h2>
            <p>We use data only to:</p>
            <ul className="list-disc space-y-2 pl-6">
              <li>Synchronize playback for room participants</li>
              <li>Deliver and display chat messages</li>
              <li>
                Operate, secure, and improve reliability (e.g., preventing
                abuse, diagnosing outages)
              </li>
            </ul>
            <p>We do not use your data for advertising.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-100">
              4) Data storage and retention
            </h2>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                Chat messages and room activity may be stored on our servers to
                support features like chat history.
              </li>
              <li>
                In some cases (e.g., during outages), data may be handled
                temporarily and could be lost on server restart.
              </li>
              <li>
                We retain data only as long as necessary to provide the service
                and for legitimate operational needs.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-100">
              5) Data sharing
            </h2>
            <p>
              We do not sell user data. We do not share user data with third
              parties except:
            </p>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                service providers required to operate our infrastructure
                (hosting, databases, monitoring), under appropriate
                protections; or
              </li>
              <li>when required by law.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-100">
              6) User controls
            </h2>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                You can stop data processing by disconnecting or uninstalling
                the extension.
              </li>
              <li>
                Room IDs are user-provided; using a different Room ID creates a
                separate session.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-100">
              7) Security
            </h2>
            <p>
              We use reasonable technical measures to protect data in transit
              and at rest. No method of transmission or storage is 100% secure.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-100">
              8) Children’s privacy
            </h2>
            <p>
              This service is not intended for children under 13 (or the
              minimum age required in your jurisdiction). We do not knowingly
              collect personal information from children.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-100">9) Contact</h2>
            <p>
              Questions or requests about this Privacy Policy can be sent to:
            </p>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                Website:{" "}
                <a
                  className="text-indigo-300 hover:text-indigo-200 underline-offset-2 hover:underline"
                  href="https://wehuddle.tv/"
                >
                  https://wehuddle.tv/
                </a>
              </li>
              <li>
                Email:{" "}
                <a
                  className="text-indigo-300 hover:text-indigo-200 underline-offset-2 hover:underline"
                  href="mailto:support@wehuddle.tv"
                >
                  support@wehuddle.tv
                </a>
              </li>
            </ul>
          </section>
        </div>
      </main>

      <footer className="py-4 px-6 border-t border-white/5 flex items-center justify-center text-xs text-slate-500">
        © {new Date().getFullYear()} WeHuddle
      </footer>
    </div>
  );
}
