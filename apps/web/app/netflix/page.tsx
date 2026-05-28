import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Watch Netflix together",
  description:
    "Watch Netflix together with friends. Install the Huddle Chrome extension or get the Android app to sync playback in real time.",
  alternates: { canonical: "/netflix" },
  openGraph: {
    title: "Watch Netflix together — Huddle",
    description:
      "Sync Netflix playback across friends. Chrome extension and Android app.",
    url: "https://wehuddle.tv/netflix",
    siteName: "WeHuddle",
    type: "website",
  },
};

const CURRENT_YEAR = new Date().getFullYear();

export default function NetflixPage() {
  return (
    <div className="relative min-h-screen flex flex-col bg-linear-to-b from-slate-900 via-slate-950 to-black text-slate-200 overflow-x-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[80rem] h-[40rem] rounded-full bg-rose-500/15 blur-3xl" />
        <div className="absolute top-1/3 -right-32 w-[28rem] h-[28rem] rounded-full bg-rose-700/15 blur-3xl" />
      </div>

      <header className="h-16 flex items-center justify-between px-4 sm:px-6 lg:px-8 border-b border-white/10 backdrop-blur-xl bg-slate-950/60 sticky top-0 z-50">
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
          className="h-8 px-3 rounded-lg border border-white/10 bg-white/5 text-slate-200 text-xs font-medium hover:bg-white/10 transition-colors inline-flex items-center"
        >
          Back home
        </Link>
      </header>

      <main className="flex-1 flex flex-col items-center px-4 sm:px-6 py-10 sm:py-16 gap-12">
        {/* Hero */}
        <div className="w-full max-w-3xl flex flex-col items-center text-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full border border-rose-500/40 bg-rose-500/10 text-rose-200">
            <svg
              className="w-3 h-3"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M5.398 0v.006c3.028 8.556 5.37 15.175 8.348 23.596 2.344.058 4.85.398 4.854.398-2.8-7.924-5.923-16.747-8.487-24zm8.489 0v9.63L18.6 22.951c-.043-7.86-.004-15.913.002-22.95zM5.398 1.05V24c1.873-.225 2.81-.312 4.715-.398v-9.22z" />
            </svg>
            Netflix watch-together
          </span>
          <h1 className="font-semibold text-slate-50 text-3xl sm:text-4xl lg:text-5xl tracking-tight">
            Watch Netflix together,
            <br />
            <span className="bg-clip-text bg-linear-to-r from-rose-300 via-rose-400 to-amber-300 text-transparent">
              perfectly in sync.
            </span>
          </h1>
          <p className="text-sm sm:text-base text-slate-400 max-w-xl">
            Netflix doesn&rsquo;t allow third-party sites to embed its player —
            so we ship a Chrome extension and an Android app that drive Netflix
            on your own device while keeping playback in sync across the room.
          </p>
        </div>

        {/* Two cards: Chrome extension + Android app */}
        <div className="w-full max-w-3xl grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="relative bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 p-5 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-indigo-300"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.75}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 3a15 15 0 010 18M3 12h18" />
                </svg>
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-slate-100">
                  Chrome extension
                </span>
                <span className="text-xs text-slate-400">
                  Chrome, Edge, Brave, Arc, Opera
                </span>
              </div>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Install once. The extension hooks into netflix.com inside your
              regular browser tab and syncs play/pause/seek to your room over
              the same socket the website uses. Works for Netflix only.
            </p>
            <ol className="text-xs text-slate-400 leading-relaxed flex flex-col gap-1 list-decimal pl-4">
              <li>Install Huddle for Netflix from the Chrome Web Store.</li>
              <li>Create or join a room on wehuddle.tv.</li>
              <li>Open netflix.com/watch/&hellip; in another tab — it&rsquo;ll auto-join the room.</li>
            </ol>
            <a
              href="https://chromewebstore.google.com/detail/huddle-for-netflix/mmghgnlloogcifdblldihfmjoefabohc"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-auto h-10 rounded-xl border border-indigo-500/40 bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-100 text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors"
            >
              Install from Chrome Web Store
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 3h7v7M21 3l-9 9M5 5h6M5 19h14a2 2 0 002-2v-6" />
              </svg>
            </a>
          </div>

          <div className="relative bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 p-5 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-emerald-300"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.75}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="6" y="2" width="12" height="20" rx="2" />
                  <path d="M11 18h2" />
                </svg>
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-slate-100">
                  Android app
                </span>
                <span className="text-xs text-slate-400">
                  Phone, tablet, Android TV
                </span>
              </div>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Loads Netflix inside the Huddle app&rsquo;s embedded WebView with
              hardware Widevine DRM. You sign into your own Netflix once;
              playback stays in sync with the rest of the room.
            </p>
            <ol className="text-xs text-slate-400 leading-relaxed flex flex-col gap-1 list-decimal pl-4">
              <li>Install the Huddle Android app.</li>
              <li>Tap any wehuddle.tv/r/&hellip; link to open the room in-app.</li>
              <li>Pick a Netflix title — the player launches inline and syncs.</li>
            </ol>
            <a
              href="#"
              className="mt-auto h-10 rounded-xl border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-100 text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors"
            >
              Get the Android app
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 3h7v7M21 3l-9 9M5 5h6M5 19h14a2 2 0 002-2v-6" />
              </svg>
            </a>
          </div>
        </div>

        {/* FAQ */}
        <div className="w-full max-w-2xl flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-slate-100">Common questions</h2>

          <details className="group bg-white/5 rounded-xl border border-white/10 p-4 open:bg-white/[0.07] transition-colors">
            <summary className="text-sm font-medium text-slate-200 cursor-pointer list-none flex items-center justify-between">
              <span>Why can&rsquo;t I just paste a Netflix URL into a room?</span>
              <span className="text-slate-500 group-open:rotate-180 transition-transform">⌄</span>
            </summary>
            <p className="text-xs text-slate-400 leading-relaxed mt-3">
              Netflix sets <code className="text-slate-300">X-Frame-Options: DENY</code> on
              every response, and Widevine DRM is bound to the top-level browsing
              context. Together they make it impossible for any website to embed
              Netflix in an iframe — not Huddle, not Teleparty, not Rave, not
              anyone. The browser itself enforces this. The extension and app
              both work because they run as a privileged client *outside* the
              webpage sandbox.
            </p>
          </details>

          <details className="group bg-white/5 rounded-xl border border-white/10 p-4 open:bg-white/[0.07] transition-colors">
            <summary className="text-sm font-medium text-slate-200 cursor-pointer list-none flex items-center justify-between">
              <span>Do I need a Netflix subscription?</span>
              <span className="text-slate-500 group-open:rotate-180 transition-transform">⌄</span>
            </summary>
            <p className="text-xs text-slate-400 leading-relaxed mt-3">
              Yes — everyone in the room signs into their own Netflix account.
              Huddle never proxies your account or shares it across users; we
              just keep playback aligned across each viewer&rsquo;s own session.
            </p>
          </details>

          <details className="group bg-white/5 rounded-xl border border-white/10 p-4 open:bg-white/[0.07] transition-colors">
            <summary className="text-sm font-medium text-slate-200 cursor-pointer list-none flex items-center justify-between">
              <span>What about Disney+, HBO Max, Hulu, Apple TV+?</span>
              <span className="text-slate-500 group-open:rotate-180 transition-transform">⌄</span>
            </summary>
            <p className="text-xs text-slate-400 leading-relaxed mt-3">
              Same DRM constraint as Netflix, but they each need their own
              integration — different player APIs, different anti-bot detection.
              They&rsquo;re on the roadmap; for now Huddle&rsquo;s chat, voice,
              and reactions still work alongside whatever you&rsquo;re watching
              in your own tab.
            </p>
          </details>

          <details className="group bg-white/5 rounded-xl border border-white/10 p-4 open:bg-white/[0.07] transition-colors">
            <summary className="text-sm font-medium text-slate-200 cursor-pointer list-none flex items-center justify-between">
              <span>iOS support?</span>
              <span className="text-slate-500 group-open:rotate-180 transition-transform">⌄</span>
            </summary>
            <p className="text-xs text-slate-400 leading-relaxed mt-3">
              Not yet — Apple App Store guideline 4.3 / 5.2.1 makes the WebView
              pattern risky to ship. The website + extension work fine on Mac
              browsers and the Android app covers mobile.
            </p>
          </details>
        </div>
      </main>

      <footer className="py-5 px-6 border-t border-white/5 flex items-center justify-center gap-4 text-xs text-slate-500">
        <Link href="/privacy" className="hover:text-slate-300 transition-colors">
          Privacy Policy
        </Link>
        <span className="text-slate-700">·</span>
        <span>© {CURRENT_YEAR} WeHuddle</span>
      </footer>
    </div>
  );
}
