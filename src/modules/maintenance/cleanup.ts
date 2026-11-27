import { Temporal } from "@js-temporal/polyfill";
import type { PrismaClient } from "../../generated/prisma/client";
import { TIMEZONE } from "../bookings/domain";

export const RATE_LIMIT_STALE_MS = 3_600_000;
export const SENT_NOTIFICATION_RETENTION_MS = 90 * 24 * 3_600_000;
export const DEFAULT_BATCH_SIZE = 500;
export const MAX_BATCH_SIZE = 10_000;

export type CleanupTable = "rateLimit" | "session" | "verification" | "notification" | "bookingPersonalData";
export type CleanupResult = { matched: number; deleted: number; batches: number };
export type CleanupReport = {
  apply: boolean;
  now: Date;
  cutoffs: { rateLimitMs: bigint; session: Date; verification: Date; notificationSentBefore: Date; bookingEndsBefore: Date };
  results: Record<CleanupTable, CleanupResult>;
};
export type CleanupOptions = { apply: boolean; batchSize?: number; now?: Date };

export function subtractCalendarMonths(date: Date, months: number): Date {
  return new Date(Temporal.Instant.fromEpochMilliseconds(date.getTime())
    .toZonedDateTimeISO(TIMEZONE).subtract({ months }).toInstant().epochMilliseconds);
}

export async function runCleanup(db: PrismaClient, options: CleanupOptions): Promise<CleanupReport> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH_SIZE) {
    throw new Error(`El tamaño de lote debe ser un entero entre 1 y ${MAX_BATCH_SIZE}.`);
  }
  // Fixed once so every table and every batch uses the same strict cutoffs.
  const now = options.now ?? new Date();
  const rateLimitMs = BigInt(now.getTime() - RATE_LIMIT_STALE_MS);
  const notificationSentBefore = new Date(now.getTime() - SENT_NOTIFICATION_RETENTION_MS);
  const settings = await db.businessSettings.findUnique({ where: { id: 1 }, select: { bookingPersonalDataRetentionMonths: true } });
  const retentionMonths = settings?.bookingPersonalDataRetentionMonths ?? 24;
  const bookingEndsBefore = subtractCalendarMonths(now, retentionMonths);
  const terminalStatuses = ["REJECTED", "CANCELLED", "CONFIRMED"] as const;

  const count = {
    rateLimit: () => db.rateLimit.count({ where: { lastRequest: { lt: rateLimitMs } } }),
    session: () => db.session.count({ where: { expiresAt: { lt: now } } }),
    verification: () => db.verification.count({ where: { expiresAt: { lt: now } } }),
    notification: () => db.notificationOutbox.count({
      where: { status: "SENT", sentAt: { not: null, lt: notificationSentBefore } },
    }),
    bookingPersonalData: () => db.bookingRequest.count({
      where: { status: { in: [...terminalStatuses] }, endsAt: { lt: bookingEndsBefore },
        OR: [{ guestName: { not: "Solicitud anonimizada" } }, { guestEmail: { not: { endsWith: "@anonimizado.invalid" } } }, { guestPhone: { not: null } }] },
    }),
  };
  // Each batch locks only unlocked candidate rows; the condition is repeated on DELETE.
  const batch = {
    rateLimit: () => db.$executeRaw`
      WITH doomed AS (SELECT id FROM "RateLimit" WHERE "lastRequest" < ${rateLimitMs}::bigint LIMIT ${batchSize} FOR UPDATE SKIP LOCKED)
      DELETE FROM "RateLimit" t USING doomed WHERE t.id = doomed.id AND t."lastRequest" < ${rateLimitMs}::bigint`,
    session: () => db.$executeRaw`
      WITH doomed AS (SELECT id FROM "Session" WHERE "expiresAt" < ${now}::timestamptz LIMIT ${batchSize} FOR UPDATE SKIP LOCKED)
      DELETE FROM "Session" t USING doomed WHERE t.id = doomed.id AND t."expiresAt" < ${now}::timestamptz`,
    verification: () => db.$executeRaw`
      WITH doomed AS (SELECT id FROM "Verification" WHERE "expiresAt" < ${now}::timestamptz LIMIT ${batchSize} FOR UPDATE SKIP LOCKED)
      DELETE FROM "Verification" t USING doomed WHERE t.id = doomed.id AND t."expiresAt" < ${now}::timestamptz`,
    notification: () => db.$executeRaw`
      WITH doomed AS (SELECT id FROM "NotificationOutbox" WHERE status = 'SENT' AND "sentAt" IS NOT NULL AND "sentAt" < ${notificationSentBefore}::timestamptz LIMIT ${batchSize} FOR UPDATE SKIP LOCKED)
      DELETE FROM "NotificationOutbox" t USING doomed WHERE t.id = doomed.id AND t.status = 'SENT' AND t."sentAt" IS NOT NULL AND t."sentAt" < ${notificationSentBefore}::timestamptz`,
    bookingPersonalData: () => db.$executeRaw`
      WITH doomed AS (
        SELECT id FROM "BookingRequest"
        WHERE status IN ('REJECTED', 'CANCELLED', 'CONFIRMED') AND "endsAt" < ${bookingEndsBefore}::timestamptz
          AND ("guestName" <> 'Solicitud anonimizada' OR "guestEmail" NOT LIKE '%@anonimizado.invalid' OR "guestPhone" IS NOT NULL)
        LIMIT ${batchSize} FOR UPDATE SKIP LOCKED
      )
      UPDATE "BookingRequest" AS request
      SET "guestName" = 'Solicitud anonimizada',
          "guestEmail" = 'anonimizado+' || request.id::text || '@anonimizado.invalid',
          "guestPhone" = NULL
      FROM doomed WHERE request.id = doomed.id AND request.status IN ('REJECTED', 'CANCELLED', 'CONFIRMED')
        AND request."endsAt" < ${bookingEndsBefore}::timestamptz`,
  };

  const results = {} as Record<CleanupTable, CleanupResult>;
  for (const table of ["rateLimit", "session", "verification", "notification", "bookingPersonalData"] as const) {
    const result: CleanupResult = { matched: await count[table](), deleted: 0, batches: 0 };
    if (options.apply) {
      let removed: number;
      do {
        removed = await batch[table]();
        result.deleted += removed;
        result.batches++;
      } while (removed === batchSize);
    }
    results[table] = result;
  }
  return {
    apply: options.apply,
    now,
    cutoffs: { rateLimitMs, session: now, verification: now, notificationSentBefore, bookingEndsBefore },
    results,
  };
}
