import "server-only";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalDb = globalThis as unknown as { domainDb?: PrismaClient };

// Lazy: importing the app never opens a connection and does not require DATABASE_URL.
export function getDb() {
  if (globalDb.domainDb) return globalDb.domainDb;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL no está configurada.");
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  globalDb.domainDb = client;
  return client;
}
