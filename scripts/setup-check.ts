import "dotenv/config";
import { readdir } from "node:fs/promises";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { validateSetupEnvironment } from "./setup-check-validation";

async function main() {
  const errors = validateSetupEnvironment(process.env);
  if (errors.length) {
    for (const error of errors) console.error(`✗ ${error}`);
    process.exitCode = 1;
    return;
  }

  const migrations = (await readdir("prisma/migrations", { withFileTypes: true }))
    .filter(entry => entry.isDirectory() && /^\d{12,14}_.+/.test(entry.name))
    .map(entry => entry.name)
    .sort();
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  let failed = false;
  const report = (label: string, ok: boolean, detail: string) => {
    console.log(`${ok ? "✓" : "✗"} ${label}: ${detail}`);
    if (!ok) failed = true;
  };

  try {
    await db.$queryRaw`SELECT 1`;
    report("Conexión PostgreSQL", true, "conectada");

    const extensions = await db.$queryRaw<Array<{ installed: boolean }>>`
      SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'btree_gist') AS installed
    `;
    report("Extensión btree_gist", extensions[0]?.installed === true,
      extensions[0]?.installed ? "habilitada" : "no está habilitada");

    const migrationTable = await db.$queryRaw<Array<{ exists: boolean }>>`
      SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS exists
    `;
    if (!migrationTable[0]?.exists) {
      report("Migraciones", false, "no existe el registro de migraciones; ejecuta npm run db:deploy");
    } else {
      const appliedRows = await db.$queryRaw<Array<{ migration_name: string }>>`
        SELECT migration_name FROM public."_prisma_migrations"
        WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
      `;
      const applied = new Set(appliedRows.map(row => row.migration_name));
      const missing = migrations.filter(name => !applied.has(name));
      report("Migraciones", missing.length === 0,
        missing.length ? `pendientes: ${missing.join(", ")}; ejecuta npm run db:deploy` : `${migrations.length} aplicadas`);
    }
  } catch {
    report("Comprobaciones de base de datos", false,
      "no fue posible validar la conexión o el estado; revisa DATABASE_URL, permisos y disponibilidad del servidor");
  } finally {
    await db.$disconnect();
  }
  if (failed) process.exitCode = 1;
  else console.log("Instalación lista para continuar.");
}

main().catch(() => {
  console.error("No se pudo completar setup:check. Revisa la configuración sin compartir secretos.");
  process.exitCode = 1;
});
