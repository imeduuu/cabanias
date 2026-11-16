import "server-only";
import { cache } from "react";
import { getDb } from "./db";
import type { Cabin } from "../modules/cabins/data";

export const getBusiness = cache(async () => {
  const row = await getDb().businessSettings.findUnique({ where: { id: 1 } });
  const texts = (row?.homeTexts ?? {}) as Record<string, string>;
  return { configured: !!row, name: row?.name ?? "Cabañas", tagline: row?.tagline ?? "Sitio en preparación",
    description: row?.description ?? "Pronto encontrarás aquí nuestros alojamientos.", location: row?.location ?? "",
    logo: row?.logoUrl ?? "", contact: { email: row?.contactEmail ?? "", phoneLabel: row?.contactPhone ?? "" },
    colors: { primary: row?.primaryColor ?? "#244d40", accent: row?.accentColor ?? "#bb5c37", background: row?.backgroundColor ?? "#faf8f2" },
    timezone: "America/Santiago", currency: "CLP", locale: "es-CL", cancellationPolicy: row?.cancellationPolicy ?? "",
    checkInHour: row?.checkInHour ?? 15, checkOutHour: row?.checkOutHour ?? 11,
    demoNotice: "Las solicitudes quedan pendientes de aceptación del dueño. No son reservas confirmadas.",
    home: { eyebrow: texts.eyebrow ?? "", catalogTitle: texts.catalogTitle ?? "Nuestras cabañas", catalogDescription: texts.catalogDescription ?? "",
      storyTitle: texts.storyTitle ?? "", storyBody: texts.storyBody ?? "" } };
});
const include = { images: { orderBy: { position: "asc" as const } }, amenities: { include: { amenity: true } }, seasonalRates: { orderBy: { startDate: "asc" as const } } };
type Row = Awaited<ReturnType<typeof rows>>[number];
function rows() { return getDb().cabin.findMany({ where: { publicationStatus: "PUBLISHED" }, include, orderBy: { createdAt: "asc" } }); }
function toPublic(row: Row): Cabin & { gallery: { url: string; alt: string }[]; seasons: { name: string; startDate: string; endDate: string; rateClp: number }[] } {
  return { slug: row.slug, name: row.name, subtitle: row.description.slice(0, 100), description: row.description,
    mode: row.mode === "NIGHTLY" ? "night" : "hour", price: row.baseRateClp, guests: row.capacity, beds: row.bedrooms,
    image: row.images[0]?.url ?? "/images/logo.svg", amenities: row.amenities.map(a => a.amenity.name),
    gallery: row.images.map(i => ({ url: i.url, alt: i.alt })),
    seasons: row.seasonalRates.map(s => ({ name: s.name, startDate: s.startDate.toISOString().slice(0, 10), endDate: s.endDate.toISOString().slice(0, 10), rateClp: s.rateClp })) };
}
export async function getPublishedCabins() { return (await rows()).map(toPublic); }
export async function getPublishedCabin(slug: string) {
  const row = await getDb().cabin.findFirst({ where: { slug, publicationStatus: "PUBLISHED" }, include });
  return row ? toPublic(row) : null;
}
