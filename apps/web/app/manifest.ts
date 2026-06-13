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
        src: "/icon-192",
        type: "image/png",
        sizes: "192x192",
        purpose: "any",
      },
      {
        src: "/icon-512",
        type: "image/png",
        sizes: "512x512",
        purpose: "any",
      },
      {
        // Same glyph kept inside the central ~80% safe zone so masks
        // (circle/squircle) don't clip it — this unlocks the install prompt.
        src: "/icon-512",
        type: "image/png",
        sizes: "512x512",
        purpose: "maskable",
      },
      {
        // iOS apple-touch-icon at its true rendered size; not maskable.
        src: "/apple-icon",
        type: "image/png",
        sizes: "180x180",
        purpose: "any",
      },
    ],
  };
}
