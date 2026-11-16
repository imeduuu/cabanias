import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { assertLocalUrl } from "./local-db-safety.mjs";
import { seedDemo } from "../src/modules/management/demo";
async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("La carga demo no está permitida en producción.");
  assertLocalUrl(process.env.DATABASE_URL, "dev");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    const result = await seedDemo(db);
    console.log(result.alreadyLoaded ? "La demostración ya se cargó. No se modificaron ni restauraron registros." : `Demostración cargada: ${result.created} cabañas nuevas. Los registros existentes se conservaron.`);
  } finally { await db.$disconnect(); }
}
main().catch(() => { console.error("No se pudo cargar la demostración. Comprueba la conexión local y las migraciones."); process.exitCode = 1; });
