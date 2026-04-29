import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ErrorBoundary } from "./components/ErrorBoundary";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
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
      // Optional PNG fallback (add apps/web/public/favicon.png if desired)
      { url: "/favicon.png?v=2", type: "image/png" },
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
      { url: "/favicon.png?v=2", type: "image/png" },
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
    <html
      lang="en"
      suppressHydrationWarning
      className="[color-scheme:dark]"
    >
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} bg-slate-950 text-slate-50 antialiased selection:bg-indigo-500/35 selection:text-slate-50 [font-feature-settings:'ss01','cv02','cv11']`}
        suppressHydrationWarning
      >
        <ErrorBoundary>{children}</ErrorBoundary>
      </body>
    </html>
  );
}
