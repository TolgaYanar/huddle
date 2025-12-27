import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://wehuddle.tv/",
      changeFrequency: "daily",
      priority: 1,
    },
  ];
}
