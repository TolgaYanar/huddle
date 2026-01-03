import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

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
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable}`}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
