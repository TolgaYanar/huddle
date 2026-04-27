import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WeHuddle",
    short_name: "Huddle",
    description:
      "Watch videos together in sync. Create a private room and hit play together.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#020617",
    theme_color: "#020617",
    icons: [
      {
        src: "/favicon.svg",
        type: "image/svg+xml",
        sizes: "any",
        purpose: "any",
      },
      {
        src: "/icon",
        type: "image/png",
        sizes: "256x256",
        purpose: "any",
      },
      {
        src: "/apple-icon",
        type: "image/png",
        sizes: "180x180",
        purpose: "maskable",
      },
    ],
  };
}
