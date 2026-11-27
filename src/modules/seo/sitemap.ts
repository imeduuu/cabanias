import type { MetadataRoute } from "next";

export type SitemapCabin = { slug: string; publicationStatus: string };

export function createSitemap(baseUrl: URL, cabins: SitemapCabin[]): MetadataRoute.Sitemap {
  return [
    { url: baseUrl.toString(), priority: 1 },
    ...cabins.filter((cabin) => cabin.publicationStatus === "PUBLISHED").map((cabin) => ({
      url: new URL(`/cabanas/${encodeURIComponent(cabin.slug)}`, baseUrl).toString(), priority: 0.8,
    })),
  ];
}
