import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { sendPendingNotifications } from "../src/modules/notifications/service";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL no está configurada.");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    const result = await sendPendingNotifications(db);
    console.log(`Notificaciones enviadas: ${result.sent}; intentos fallidos: ${result.failed}.`);
    for (const error of result.errors) console.error(`SMTP: ${error}`);
    if (result.failed > 0) process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}

main().catch(error => {
  const message = error instanceof Error ? error.message : "Error inesperado.";
  const redacted = [process.env.DATABASE_URL, process.env.TEST_DATABASE_URL, process.env.SMTP_PASSWORD]
    .filter((secret): secret is string => Boolean(secret))
    .reduce((text, secret) => text.replaceAll(secret, "[redactado]"), message);
  console.error(redacted);
  process.exitCode = 1;
});
