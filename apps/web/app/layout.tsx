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
    default: "WeHuddle",
    template: "%s | WeHuddle",
  },
  description: "Create or join a room and watch together in sync.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "WeHuddle",
    description: "Create or join a room and watch together in sync.",
    url: "https://wehuddle.tv",
    siteName: "WeHuddle",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "WeHuddle",
    description: "Create or join a room and watch together in sync.",
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
