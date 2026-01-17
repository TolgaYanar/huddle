import type { Metadata } from "next";
import { HomeClient } from "./home-client";

export const metadata: Metadata = {
  title: "WeHuddle — Watch videos together in sync",
  description:
    "Create a private room and watch YouTube together in sync with chat. No downloads — just share a link.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "WeHuddle — Watch videos together in sync",
    description:
      "Create a private room and watch videos together in sync. Share a link and hit play together.",
    url: "https://wehuddle.tv",
    siteName: "WeHuddle",
    type: "website",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "WeHuddle popcorn logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "WeHuddle — Watch videos together in sync",
    description:
      "Create a private room and watch videos together in sync. Share a link and hit play together.",
    images: ["/opengraph-image"],
  },
};

export default function Page() {
  return <HomeClient />;
}
