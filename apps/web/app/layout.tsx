import type { Metadata } from "next";
import {
  IBM_Plex_Mono,
  Instrument_Sans,
  Instrument_Serif,
} from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { ErrorBoundary } from "./components/ErrorBoundary";

/*
 * Geist was loaded here and never applied — the body fell through to the
 * system stack, so the site had no chosen typeface at all while still paying
 * to download one.
 *
 * Instrument Serif carries the headings: high stroke contrast and sharp
 * terminals, the register of a title card, which is what this product is for.
 * Instrument Sans is by the same foundry and drawn to sit with it, so the
 * pairing is a decision rather than two fonts that happen to coexist. The
 * serif stays on display sizes only; at 12px its contrast would thin out.
 */
const displaySerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});

const bodySans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

// Room ids and timers only. Mono here means "this is a literal value you may
// need to copy or compare", not decoration.
const codeMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-code",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://wehuddle.tv"),
  title: {
    default: "WeHuddle | Watch Videos Together with Friends",
    template: "%s | WeHuddle",
  },
  description:
    "Join WeHuddle to create instant, private video rooms. Watch YouTube together and chat with friends—no account required.",
  applicationName: "WeHuddle",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      {
        url: "/favicon.svg?v=2",
        type: "image/svg+xml",
      },
      // PNG fallback for clients that don't render SVG favicons.
      { url: "/icon-192", type: "image/png", sizes: "192x192" },
    ],
    apple: [
      // iOS prefers a PNG apple-touch-icon
      { url: "/apple-icon?v=2", type: "image/png" },
    ],
    shortcut: [
      {
        url: "/favicon.svg?v=2",
        type: "image/svg+xml",
      },
      { url: "/icon-192", type: "image/png", sizes: "192x192" },
    ],
  },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "WeHuddle",
    description: "Create or join a room and watch together in sync.",
    url: "https://wehuddle.tv",
    siteName: "WeHuddle",
    type: "website",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "WeHuddle",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "WeHuddle",
    description:
      "Join WeHuddle to create instant, private video rooms. Watch YouTube together and chat with friends—no account required.",
    images: ["/opengraph-image"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": "https://wehuddle.tv/#organization",
        name: "WeHuddle",
        url: "https://wehuddle.tv",
        logo: "https://wehuddle.tv/favicon.svg",
      },
      {
        "@type": "WebSite",
        "@id": "https://wehuddle.tv/#website",
        name: "WeHuddle",
        url: "https://wehuddle.tv",
        description:
          "Create instant, private video rooms. Watch YouTube together and chat with friends.",
        publisher: { "@id": "https://wehuddle.tv/#organization" },
      },
    ],
  };

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/*
          Runs before first paint so a dark-mode user never sees a white flash.
          It has to be inline and blocking for that reason; anything deferred is
          already too late. Kept to one statement and no dependencies.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var p=localStorage.getItem("huddle-theme");var d=p==="dark"||(p!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`,
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body
        className={`${bodySans.variable} ${displaySerif.variable} ${codeMono.variable} font-sans bg-bg text-ink antialiased selection:bg-accent selection:text-accent-ink`}
        suppressHydrationWarning
      >
        <ErrorBoundary>{children}</ErrorBoundary>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
