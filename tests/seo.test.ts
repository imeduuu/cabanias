import assert from "node:assert/strict";
import test from "node:test";
import { createSitemap } from "../src/modules/seo/sitemap";

test("sitemap includes the home and published cabins, never drafts or archived cabins", () => {
  const sitemap = createSitemap(new URL("https://stay.example/"), [
    { slug: "bosque", publicationStatus: "PUBLISHED" },
    { slug: "borrador", publicationStatus: "DRAFT" },
    { slug: "archivada", publicationStatus: "ARCHIVED" },
  ]);
  assert.deepEqual(sitemap.map(({ url }) => url), ["https://stay.example/", "https://stay.example/cabanas/bosque"]);
});
