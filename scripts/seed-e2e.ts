import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { business } from "../src/config/business";
import { cabins } from "../src/modules/cabins/data";
import { createInitialAdministrator } from "../src/modules/auth/core";
import { assertLocalUrl } from "./local-db-safety.mjs";

async function main() {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  assertLocalUrl(databaseUrl, "test");
  const adminEmail = process.env.E2E_ADMIN_EMAIL;
  const adminPassword = process.env.E2E_ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword || adminPassword.length < 32) throw new Error("Faltan credenciales efímeras de E2E.");

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }) });
  try {
    await db.businessSettings.create({ data: {
      id: 1, name: business.name, tagline: business.tagline, description: business.description,
      location: business.location, logoUrl: business.logo, contactEmail: business.contact.email,
      notificationEmail: "avisos@refugioclaro.example", whatsappNumber: "+56912345678",
      primaryColor: business.colors.primary, accentColor: business.colors.accent,
      backgroundColor: business.colors.background, homeTexts: business.home,
      cancellationPolicy: business.cancellationPolicy,
    } });
    for (const [index, cabin] of cabins.entries()) {
      await db.cabin.create({ data: {
        id: `22222222-2222-4222-8222-${String(index + 1).padStart(12, "0")}`,
        slug: cabin.slug, name: cabin.name, description: cabin.description,
        mode: cabin.mode === "night" ? "NIGHTLY" : "HOURLY", capacity: cabin.guests,
        bedrooms: cabin.beds, baseRateClp: cabin.price, publicationStatus: "PUBLISHED",
        images: { create: { url: cabin.image, alt: `Ilustración ficticia de ${cabin.name}`, position: 0 } },
        amenities: { create: cabin.amenities.map(name => ({ amenity: { connectOrCreate: { where: { name }, create: { name } } } })) },
        seasonalRates: { create: { name: "Temporada ficticia E2E", startDate: new Date("2030-01-01T00:00:00Z"),
          endDate: new Date("2030-03-01T00:00:00Z"), rateClp: cabin.price + 10000 } },
      } });
    }
    const blockedCabin = await db.cabin.findUniqueOrThrow({ where: { slug: "bosque" }, select: { id: true } });
    await db.manualBlock.create({ data: { cabinId: blockedCabin.id,
      startsAt: new Date("2030-02-10T18:00:00.000Z"), endsAt: new Date("2030-02-12T15:00:00.000Z"),
      reason: "Bloqueo ficticio para pruebas E2E" } });
    await createInitialAdministrator(db, { email: adminEmail, name: "Administrador E2E", password: adminPassword });
  } finally { await db.$disconnect(); }
}

main().catch(error => { console.error("No se pudieron crear los datos efímeros de E2E."); console.error(error instanceof Error ? error.message : "Error desconocido."); process.exitCode = 1; });
