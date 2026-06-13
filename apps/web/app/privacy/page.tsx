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
          <p className="mt-2 text-sm text-slate-400">Last updated: 2026-06-13</p>
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
                  Account details
                </span>{" "}
                if you choose to register: a username and password. Accounts are
                optional — rooms work without one. Passwords are never stored in
                plaintext; we store only a salted, hashed value (scrypt) used to
                verify your login.
              </li>
              <li>
                <span className="font-medium text-slate-100">Saved rooms</span>{" "}
                that you bookmark while logged in. These are stored on our
                servers and tied to your account.
              </li>
              <li>
                <span className="font-medium text-slate-100">
                  Voice/video and screen-share connection data
                </span>
                . Optional calls and screen sharing use peer-to-peer WebRTC. The
                server only relays the connection-setup signaling needed to
                start a call (offers/answers and ICE candidates) — it does not
                relay or record the audio/video itself. Setting up a direct
                peer-to-peer connection reveals participants’ IP addresses to
                one another; this is standard WebRTC behavior.
              </li>
              <li>
                <span className="font-medium text-slate-100">
                  Technical data
                </span>{" "}
                such as IP address and basic connection metadata for security,
                abuse prevention, and service reliability.
              </li>
              <li>
                <span className="font-medium text-slate-100">
                  Aggregate usage and performance analytics
                </span>{" "}
                via Vercel Web Analytics and Speed Insights (e.g., page views,
                referrers, and anonymized page-performance metrics). This is
                privacy-friendly: it uses no cookies, does not track you across
                other sites, and does not build an advertising profile.
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
              <li>Enable optional peer-to-peer voice/video calls and screen share</li>
              <li>
                Create and authenticate your account, keep you signed in, and
                store the rooms you save (only if you choose to register)
              </li>
              <li>
                Operate, secure, and improve reliability (e.g., preventing
                abuse, diagnosing outages)
              </li>
              <li>
                Understand aggregate, anonymized usage (e.g., which pages are
                visited) to improve the product
              </li>
            </ul>
            <p>
              We do not use your data for advertising, and we do not sell it. We
              use no advertising SDKs and run no third-party tracking cookies.
            </p>
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
                If you register, your account (username and hashed password) and
                your saved rooms are stored on our servers for as long as your
                account exists.
              </li>
              <li>
                Recent room history is stored only in your browser’s
                localStorage on your own device — it stays client-side and is
                not sent to our servers. You can clear it by clearing your
                browser storage.
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
            <h2 className="text-xl font-semibold text-slate-100">5) Cookies</h2>
            <p>
              When you log in, we set a single first-party,{" "}
              <span className="font-medium text-slate-100">HttpOnly</span>{" "}
              session cookie so we can keep you signed in. It is not readable by
              client-side JavaScript and is used only for authentication.
            </p>
            <p>
              We do not use third-party or advertising tracking cookies. Our
              analytics (Vercel Web Analytics and Speed Insights) are
              cookie-free.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-100">
              6) Data sharing
            </h2>
            <p>
              We do not sell user data. We do not share user data with third
              parties except:
            </p>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                service providers required to operate our infrastructure
                (hosting, databases, monitoring), under appropriate
                protections;
              </li>
              <li>
                a third-party STUN server (currently Google&apos;s public STUN
                server) contacted only during voice/video call setup to discover
                your network address — a standard step in establishing a
                peer-to-peer WebRTC connection; or
              </li>
              <li>when required by law.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-100">
              7) User controls
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
              <li>
                You can use the service without an account. If you registered,
                logging out ends your session, and you can add or remove saved
                rooms at any time.
              </li>
              <li>
                Recent room history lives in your browser; clearing your browser
                storage removes it.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-100">
              8) Security
            </h2>
            <p>
              We use reasonable technical measures to protect data in transit
              and at rest. No method of transmission or storage is 100% secure.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-100">
              9) Children’s privacy
            </h2>
            <p>
              This service is not intended for children under 13 (or the
              minimum age required in your jurisdiction). We do not knowingly
              collect personal information from children.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-100">
              10) Contact
            </h2>
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
