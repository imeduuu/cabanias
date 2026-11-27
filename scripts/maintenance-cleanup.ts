import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { assertLocalUrl, assertProductionUrl } from "./local-db-safety.mjs";
import { runCleanup, type CleanupTable } from "../src/modules/maintenance/cleanup";
import { CLEANUP_USAGE, parseCleanupArgs, type CleanupArgs } from "../src/modules/maintenance/cli-args";

const LABELS: Record<CleanupTable, string> = {
  rateLimit: "Cuotas (RateLimit) sin actividad hace más de 1 hora",
  session: "Sesiones expiradas",
  verification: "Verificaciones expiradas",
  notification: "Notificaciones enviadas hace más de 90 días",
  bookingPersonalData: "Datos personales de solicitudes terminadas fuera del plazo de conservación",
};

async function main(args: CleanupArgs) {
  const production = process.env.NODE_ENV === "production";
  let expectedDatabase: string;
  let expectedUsername: string;
  let target: string;
  if (production) {
    const expected = assertProductionUrl(process.env.DATABASE_URL);
    expectedDatabase = expected.database;
    expectedUsername = expected.username;
    target = `${expected.host}/${expectedDatabase}`;
  } else {
    const expected = assertLocalUrl(process.env.DATABASE_URL, "dev");
    expectedDatabase = expected.database;
    expectedUsername = "cabanias_local";
    target = `127.0.0.1:${expected.port}/${expectedDatabase}`;
  }
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    const [identity] = await db.$queryRaw<{ database: string; username: string }[]>`SELECT current_database() AS database, current_user AS username`;
    if (identity?.database !== expectedDatabase || identity.username !== expectedUsername) {
      throw new Error("La identidad del servidor no coincide con el destino esperado. No se modificó la base.");
    }
    const report = await runCleanup(db, { apply: args.apply, batchSize: args.batchSize });
    const entries = (Object.keys(LABELS) as CleanupTable[]).map(table => [table, report.results[table]] as const);
    if (!report.apply) {
      console.log(`Modo simulación: no se cambió ninguna fila. Destino: ${target}.`);
      console.log(`Referencia: ${report.now.toISOString()}`);
      for (const [table, result] of entries) console.log(`- ${LABELS[table]}: ${result.matched}`);
      const total = entries.reduce((sum, [, result]) => sum + result.matched, 0);
      console.log(`Total que se limpiaría: ${total}. Para aplicar, ejecuta: npm run maintenance:cleanup -- --apply`);
    } else {
      console.log(`Limpieza aplicada (lotes de ${args.batchSize} filas). Destino: ${target}.`);
      console.log(`Referencia: ${report.now.toISOString()}`);
      for (const [table, result] of entries) console.log(`- ${LABELS[table]}: modificadas ${result.deleted} en ${result.batches} lotes`);
      console.log(`Total modificado: ${entries.reduce((sum, [, result]) => sum + result.deleted, 0)}.`);
    }
    console.log("Se conservan las solicitudes, fechas, cabaña, precio, desglose y BookingSubmission; solo se anonimiza nombre, correo y teléfono.");
  } finally {
    await db.$disconnect();
  }
}

let args: CleanupArgs | undefined;
try {
  args = parseCleanupArgs(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Argumentos inválidos.");
  console.error(CLEANUP_USAGE);
  process.exitCode = 2;
}
if (args?.help) {
  console.log(CLEANUP_USAGE);
} else if (args) {
  main(args).catch(error => {
    const message = error instanceof Error ? error.message : "Error inesperado.";
    const redacted = [process.env.DATABASE_URL, process.env.TEST_DATABASE_URL, process.env.SMTP_PASSWORD]
      .filter((secret): secret is string => Boolean(secret))
      .reduce((text, secret) => text.replaceAll(secret, "[redactado]"), message);
    console.error(redacted);
    process.exitCode = 1;
  });
}
