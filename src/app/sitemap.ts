import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/config/site";
import { getDb } from "@/lib/db";
import { createSitemap } from "@/modules/seo/sitemap";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const cabins = await getDb().cabin.findMany({
    where: { publicationStatus: "PUBLISHED" }, select: { slug: true, publicationStatus: true },
  });
  return createSitemap(getSiteUrl(), cabins);
}
