import type { PrismaClient } from "../../generated/prisma/client";
import { business } from "../../config/business";
import { cabins } from "../cabins/data";

export async function seedDemo(db: PrismaClient) {
  if (process.env.NODE_ENV === "production") throw new Error("La carga de demostración está deshabilitada en producción.");
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(781446301)`;
    if (await tx.developmentSeed.findUnique({ where: { id: "initial-demo-v1" } })) return { created: 0, alreadyLoaded: true };
    await tx.businessSettings.upsert({ where: { id: 1 }, update: {}, create: {
      id: 1, name: business.name, tagline: business.tagline, description: business.description,
      location: business.location, logoUrl: business.logo, contactEmail: business.contact.email,
      primaryColor: business.colors.primary, accentColor: business.colors.accent, backgroundColor: business.colors.background,
      homeTexts: business.home, cancellationPolicy: "Las cancelaciones se acuerdan directamente con el dueño. No hay reembolsos automáticos. Política ficticia de demostración.",
    } });
    let created = 0;
    for (let index = 0; index < cabins.length; index++) {
      const cabin = cabins[index], id = `11111111-1111-4111-8111-${String(index + 1).padStart(12, "0")}`;
      if (await tx.cabin.findFirst({ where: { OR: [{ id }, { slug: cabin.slug }] } })) continue;
      await tx.cabin.create({ data: { id, slug: cabin.slug, name: cabin.name, description: cabin.description,
        mode: cabin.mode === "night" ? "NIGHTLY" : "HOURLY", capacity: cabin.guests, bedrooms: cabin.beds,
        baseRateClp: cabin.price, publicationStatus: "PUBLISHED",
        images: { create: { url: cabin.image, alt: `Ilustración ficticia de ${cabin.name}`, position: 0 } },
        amenities: { create: cabin.amenities.map(name => ({ amenity: { connectOrCreate: { where: { name }, create: { name } } } })) },
        seasonalRates: { create: { name: "Verano de ejemplo 2030", startDate: new Date("2030-01-01T00:00:00Z"), endDate: new Date("2030-03-01T00:00:00Z"), rateClp: cabin.price + 10000 } },
      } });
      created++;
    }
    await tx.developmentSeed.create({ data: { id: "initial-demo-v1" } });
    return { created, alreadyLoaded: false };
  });
}
