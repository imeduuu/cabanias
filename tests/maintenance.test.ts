import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { assertLocalUrl } from "../scripts/local-db-safety.mjs";
import { runCleanup, SENT_NOTIFICATION_RETENTION_MS, RATE_LIMIT_STALE_MS, subtractCalendarMonths } from "../src/modules/maintenance/cleanup";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

test("maintenance cleanup removes expired rows and leaves booking data outside the retention policy intact", { skip: !process.env.TEST_DATABASE_URL }, async () => {
  assertLocalUrl(process.env.TEST_DATABASE_URL, "test");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL! }) });
  const now = new Date();
  const at = (offsetMs: number) => new Date(now.getTime() + offsetMs);
  const prefix = `maint-${randomUUID()}`;
  const cabinId = randomUUID();
  const counts = async () => ({
    rateLimit: await db.rateLimit.count(),
    session: await db.session.count(),
    verification: await db.verification.count(),
    notification: await db.notificationOutbox.count(),
    submission: await db.bookingSubmission.count(),
    request: await db.bookingRequest.count(),
  });
  let adminId: string | undefined;
  const requestIds: string[] = [];
  try {
    assert.equal(await db.administrator.count(), 0);
    const baseReport = await runCleanup(db, { apply: false, now });

    const admin = await db.administrator.create({ data: { email: `${prefix}@example.test`, name: "Synthetic Admin" } });
    adminId = admin.id;
    const session = (label: string, expiresAt: Date) => db.session.create({ data: { token: `${prefix}-${label}`, expiresAt, userId: admin.id } });
    const sessions = {
      expired: await session("expired", at(-1)), boundary: await session("boundary", now), live: await session("live", at(HOUR)),
    };
    const verification = (label: string, expiresAt: Date) => db.verification.create({ data: { identifier: `${prefix}-${label}`, value: "synthetic", expiresAt } });
    const verifications = {
      expired: await verification("expired", at(-1)), boundary: await verification("boundary", now), live: await verification("live", at(HOUR)),
    };
    const limit = (label: string, ageMs: number) => db.rateLimit.create({ data: { key: `${prefix}-${label}`, count: 1, lastRequest: BigInt(now.getTime() - ageMs) } });
    const staleLimits = [];
    for (let index = 0; index < 5; index++) staleLimits.push(await limit(`stale-${index}`, 2 * HOUR));
    const limitBoundary = await limit("boundary", RATE_LIMIT_STALE_MS);
    const limitRecent = await limit("recent", 59 * 60_000);
    const limitFresh = await limit("fresh", 30_000);

    await db.cabin.create({ data: { id: cabinId, slug: `maint-${cabinId}`, name: "Synthetic maintenance cabin",
      description: "Disposable fixture", mode: "HOURLY", capacity: 2, bedrooms: 1, publicationStatus: "PUBLISHED", baseRateClp: 1000 } });
    const request = async (hour: number) => {
      const row = await db.bookingRequest.create({ data: {
        cabinId, mode: "HOURLY", startsAt: new Date(Date.UTC(2036, 0, 1, hour)), endsAt: new Date(Date.UTC(2036, 0, 1, hour + 1)), guests: 1,
        guestName: "Synthetic Test", guestEmail: "synthetic@example.test", estimatedTotalClp: 2000, pricingSnapshot: { test: true },
      } });
      requestIds.push(row.id);
      return row;
    };
    const [r1, r2, r3, r4, r5] = [await request(10), await request(12), await request(14), await request(16), await request(18)];
    const outbox = (requestId: string, event: "REQUEST_CREATED" | "REQUEST_CONFIRMED", status: "SENT" | "ERROR" | "PENDING", createdAt: Date, sentAt: Date | null) =>
      db.notificationOutbox.create({ data: { requestId, event, status, recipient: "synthetic@example.test", payload: {}, createdAt, sentAt } });
    const sentOld = await outbox(r1.id, "REQUEST_CREATED", "SENT", at(-100 * DAY), at(-SENT_NOTIFICATION_RETENTION_MS - DAY));
    const sentBoundary = await outbox(r2.id, "REQUEST_CREATED", "SENT", at(-100 * DAY), at(-SENT_NOTIFICATION_RETENTION_MS));
    const sentRecent = await outbox(r3.id, "REQUEST_CREATED", "SENT", at(-100 * DAY), at(-89 * DAY));
    const errorOld = await outbox(r4.id, "REQUEST_CREATED", "ERROR", at(-200 * DAY), null);
    const pendingOld = await outbox(r5.id, "REQUEST_CREATED", "PENDING", at(-200 * DAY), null);
    const oldSubmissionHash = createHash("sha256").update(prefix).digest("hex");
    await db.bookingSubmission.create({ data: { keyHash: oldSubmissionHash, payloadHash: oldSubmissionHash, requestId: r1.id, createdAt: at(-400 * DAY) } });

    const before = await counts();
    const matched = (report: Awaited<ReturnType<typeof runCleanup>>, key: keyof typeof report.results) =>
      report.results[key].matched - baseReport.results[key].matched;

    // (1) Dry run only counts.
    const dry = await runCleanup(db, { apply: false, now });
    assert.deepEqual([matched(dry, "rateLimit"), matched(dry, "session"), matched(dry, "verification"), matched(dry, "notification")], [5, 1, 1, 1]);
    for (const result of Object.values(dry.results)) { assert.equal(result.deleted, 0); assert.equal(result.batches, 0); }
    assert.deepEqual(await counts(), before);
    assert.ok(await db.session.findUnique({ where: { id: sessions.expired.id } }));

    // (2) Apply in small batches removes only expired rows.
    const applied = await runCleanup(db, { apply: true, batchSize: 2, now });
    assert.ok(applied.results.rateLimit.deleted >= 5);
    assert.ok(applied.results.rateLimit.batches >= 3);
    const exists = {
      staleLimit: await db.rateLimit.count({ where: { id: { in: staleLimits.map(row => row.id) } } }),
      keptLimits: await db.rateLimit.count({ where: { id: { in: [limitBoundary.id, limitRecent.id, limitFresh.id] } } }),
      expiredSession: await db.session.count({ where: { id: sessions.expired.id } }),
      keptSessions: await db.session.count({ where: { id: { in: [sessions.boundary.id, sessions.live.id] } } }),
      expiredVerification: await db.verification.count({ where: { id: verifications.expired.id } }),
      keptVerifications: await db.verification.count({ where: { id: { in: [verifications.boundary.id, verifications.live.id] } } }),
      sentOld: await db.notificationOutbox.count({ where: { id: sentOld.id } }),
      keptNotifications: await db.notificationOutbox.count({ where: { id: { in: [sentBoundary.id, sentRecent.id, errorOld.id, pendingOld.id] } } }),
    };
    assert.deepEqual(exists, { staleLimit: 0, keptLimits: 3, expiredSession: 0, keptSessions: 2, expiredVerification: 0, keptVerifications: 2, sentOld: 0, keptNotifications: 4 });

    // (3) Idempotency records and requests are untouched.
    const after = await counts();
    assert.equal(after.submission, before.submission);
    assert.equal(after.request, before.request);
    assert.ok(await db.bookingSubmission.findUnique({ where: { keyHash: oldSubmissionHash } }));

    // (4) Re-running finds nothing left.
    const again = await runCleanup(db, { apply: true, batchSize: 2, now });
    for (const result of Object.values(again.results)) { assert.equal(result.deleted, 0); assert.ok(result.batches <= 1); }
  } finally {
    try {
      await db.notificationOutbox.deleteMany({ where: { requestId: { in: requestIds } } });
      await db.bookingSubmission.deleteMany({ where: { requestId: { in: requestIds } } });
      await db.bookingRequest.deleteMany({ where: { cabinId } });
      await db.cabin.deleteMany({ where: { id: cabinId } });
      await db.rateLimit.deleteMany({ where: { key: { startsWith: prefix } } });
      await db.verification.deleteMany({ where: { identifier: { startsWith: prefix } } });
      await db.session.deleteMany({ where: { token: { startsWith: prefix } } });
      if (adminId) await db.administrator.deleteMany({ where: { id: adminId } });
    } finally {
      await db.$disconnect();
    }
  }
});

test("booking personal data cleanup defaults to dry-run and preserves booking and submission records", { skip: !process.env.TEST_DATABASE_URL }, async () => {
  assertLocalUrl(process.env.TEST_DATABASE_URL, "test");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL! }) });
  const now = new Date("2036-06-30T12:00:00.000Z"), cabinId = randomUUID(), prefix = `privacy-${randomUUID()}`;
  const requestIds: string[] = [];
  try {
    await db.businessSettings.update({ where: { id: 1 }, data: { bookingPersonalDataRetentionMonths: 24 } });
    await db.cabin.create({ data: { id: cabinId, slug: `privacy-${cabinId}`, name: "Privacy test cabin", description: "Fixture",
      mode: "HOURLY", capacity: 2, bedrooms: 1, publicationStatus: "PUBLISHED", baseRateClp: 1000 } });
    const endedAt = subtractCalendarMonths(now, 25);
    const create = async (status: "PENDING" | "REJECTED" | "CANCELLED" | "CONFIRMED", endsAt: Date) => {
      const row = await db.bookingRequest.create({ data: { cabinId, mode: "HOURLY", startsAt: new Date(+endsAt - 3_600_000), endsAt,
        guestName: prefix, guestEmail: `${prefix}@example.test`, guestPhone: "+56912345678", guests: 1,
        estimatedTotalClp: 2500, pricingSnapshot: { subtotal: 2500, lineItems: [{ amount: 2500 }] } } });
      requestIds.push(row.id);
      if (status !== "PENDING") return db.bookingRequest.update({ where: { id: row.id }, data: { status } });
      return row;
    };
    const rejected = await create("REJECTED", endedAt);
    const cancelled = await create("CANCELLED", endedAt);
    const confirmed = await create("CONFIRMED", endedAt);
    const pending = await create("PENDING", endedAt);
    const boundary = await create("REJECTED", subtractCalendarMonths(now, 24));
    const submissionKey = createHash("sha256").update(prefix).digest("hex");
    await db.bookingSubmission.create({ data: { keyHash: submissionKey, payloadHash: submissionKey, requestId: rejected.id } });

    const dry = await runCleanup(db, { apply: false, now });
    assert.equal(dry.results.bookingPersonalData.matched, 3);
    assert.equal(dry.results.bookingPersonalData.deleted, 0);
    assert.equal((await db.bookingRequest.findUniqueOrThrow({ where: { id: rejected.id } })).guestName, prefix);

    const original = await db.bookingRequest.findUniqueOrThrow({ where: { id: rejected.id } });
    const applied = await runCleanup(db, { apply: true, batchSize: 2, now });
    assert.equal(applied.results.bookingPersonalData.deleted, 3);
    for (const id of [rejected.id, cancelled.id, confirmed.id]) {
      const row = await db.bookingRequest.findUniqueOrThrow({ where: { id } });
      assert.equal(row.guestName, "Solicitud anonimizada");
      assert.match(row.guestEmail, /^anonimizado\+.*@anonimizado\.invalid$/);
      assert.equal(row.guestPhone, null);
      assert.equal(+row.startsAt, +original.startsAt);
      assert.equal(+row.endsAt, +original.endsAt);
      assert.equal(row.cabinId, cabinId);
      assert.equal(row.estimatedTotalClp, 2500);
      assert.deepEqual(row.pricingSnapshot, original.pricingSnapshot);
      assert.equal(row.status === "CONFIRMED", id === confirmed.id);
    }
    assert.equal((await db.bookingRequest.findUniqueOrThrow({ where: { id: pending.id } })).guestName, prefix);
    assert.equal((await db.bookingRequest.findUniqueOrThrow({ where: { id: boundary.id } })).guestName, prefix);
    assert.equal((await db.bookingSubmission.findUniqueOrThrow({ where: { keyHash: submissionKey } })).requestId, rejected.id);
    assert.equal((await runCleanup(db, { apply: true, now })).results.bookingPersonalData.deleted, 0);
  } finally {
    await db.bookingSubmission.deleteMany({ where: { requestId: { in: requestIds } } });
    await db.bookingRequest.deleteMany({ where: { cabinId } });
    await db.cabin.deleteMany({ where: { id: cabinId } });
    await db.$disconnect();
  }
});
