import "server-only";
import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { randomUUID } from "node:crypto";
import { invariant } from "./domain";

// A signed anonymous visitor identity is HMAC-pseudonymized; no IP/email headers are read.
export async function limitPublicBooking(db: PrismaClient | Prisma.TransactionClient, kind: "quote" | "request", visitor: string) {
  const start = BigInt(Math.floor(Date.now() / 60000) * 60000);
  invariant(/^[a-f0-9]{64}$/.test(visitor), "INVALID_VISITOR", "Recarga la página antes de intentar nuevamente.");
  const key = `public-booking:v2:${kind}:${visitor}`;
  const [row] = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" (id, key, count, "lastRequest") VALUES (${randomUUID()}::uuid, ${key}, 1, ${start})
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN "RateLimit"."lastRequest" < ${start} THEN 1 ELSE LEAST("RateLimit".count + 1, 1000000) END,
      "lastRequest" = GREATEST("RateLimit"."lastRequest", ${start})
    RETURNING count`;
  invariant(row.count <= (kind === "quote" ? 40 : 5), "RATE_LIMIT", "Se alcanzó el límite de intentos. Espera un minuto antes de volver a intentar.");
}
