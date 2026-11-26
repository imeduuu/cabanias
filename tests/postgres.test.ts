import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { changeRequestStatus, createIdempotentRequest, createManualBlock, removeManualBlock } from "../src/modules/bookings/service";
import { sendPendingNotifications } from "../src/modules/notifications/service";
import { assertLocalUrl } from "../scripts/local-db-safety.mjs";
import { limitPublicBooking } from "../src/modules/bookings/public-limit";
import { createHash } from "node:crypto";

// Opt-in only: a disposable PostgreSQL database with both migrations already applied.
test("PostgreSQL invariants and concurrent writers", { skip: !process.env.TEST_DATABASE_URL }, async t => {
  assertLocalUrl(process.env.TEST_DATABASE_URL, "test");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL! }) });
  const cabinId = randomUUID();
  const startsAt = new Date("2035-01-01T15:00:00Z");
  const endsAt = new Date("2035-01-01T17:00:00Z");
  const request = (start = startsAt, end = endsAt) => db.bookingRequest.create({ data: {
    cabinId, mode: "HOURLY", startsAt: start, endsAt: end, guests: 1,
    guestName: "Synthetic Test", guestEmail: "synthetic@example.test",
    estimatedTotalClp: 2000, pricingSnapshot: { test: true },
  } });
  const clear = async () => {
    const requests = await db.bookingRequest.findMany({ where: { cabinId }, select: { id: true } });
    const requestIds = requests.map(row => row.id);
    await db.notificationOutbox.deleteMany({ where: { requestId: { in: requestIds } } });
    await db.bookingSubmission.deleteMany({ where: { requestId: { in: requestIds } } });
    await db.bookingRequest.deleteMany({ where: { cabinId } });
    await db.manualBlock.deleteMany({ where: { cabinId } });
  };
  const idempotentInput = (guestName: string, guestEmail: string, day: string) => ({
    cabinId,
    stay: { mode: "HOURLY" as const, startsAt: `${day}T15:00:00-03:00`, endsAt: `${day}T17:00:00-03:00` },
    guestName,
    guestEmail,
    guests: 1,
  });
  const submitIdempotently = (guestName: string, guestEmail: string, day: string, key: string, visitor: string) => {
    const keyHash = createHash("sha256").update(key).digest("hex");
    const payloadHash = createHash("sha256").update(`${key}:payload`).digest("hex");
    return createIdempotentRequest(db, keyHash, payloadHash, visitor, async () => idempotentInput(guestName, guestEmail, day));
  };
  try {
    await t.test("visitor quotas are atomic, isolated and separate for quotes and sends", async () => {
      const a = createHash("sha256").update(randomUUID()).digest("hex"), b = createHash("sha256").update(randomUUID()).digest("hex");
      const results = await Promise.allSettled(Array.from({length:41},()=>limitPublicBooking(db,"quote",a)));
      assert.equal(results.filter(row=>row.status === "fulfilled").length,40);
      for(let index=0;index<5;index++) await limitPublicBooking(db,"request",a);
      await assert.rejects(limitPublicBooking(db,"request",a));
      await limitPublicBooking(db,"quote",b);
      await limitPublicBooking(db,"request",b);
      await db.rateLimit.deleteMany({where:{key:{in:[`public-booking:v2:quote:${a}`,`public-booking:v2:request:${a}`,`public-booking:v2:quote:${b}`,`public-booking:v2:request:${b}`]}}});
    });
    await t.test("installed SQL contains extension, half-open GiST constraints and all domain triggers", async () => {
      const extensions = await db.$queryRaw<{ extname: string }[]>`SELECT extname FROM pg_extension WHERE extname = 'btree_gist'`;
      assert.equal(extensions.length, 1);
      const constraints = await db.$queryRaw<{ conname: string; definition: string }[]>`
        SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint
        WHERE conname IN ('occupancy_no_overlap', 'season_no_overlap')`;
      assert.equal(constraints.length, 2);
      for (const constraint of constraints) {
        assert.match(constraint.definition, /EXCLUDE USING gist/);
        assert.ok(constraint.definition.includes("'[)'"));
      }
      const triggers = await db.$queryRaw<{ tgname: string }[]>`SELECT tgname FROM pg_trigger WHERE NOT tgisinternal`;
      for (const name of ["request_validation", "cabin_terms", "request_occupancy", "block_lock", "block_occupancy", "occupancy_internal"]) {
        assert.ok(triggers.some(trigger => trigger.tgname === name), `Missing trigger ${name}`);
      }
    });
    await db.cabin.create({ data: { id: cabinId, slug: `test-${cabinId}`, name: "Synthetic test cabin",
      description: "Disposable fixture", mode: "HOURLY", capacity: 2, bedrooms: 1,
      publicationStatus: "PUBLISHED", baseRateClp: 1000 } });
    await db.businessSettings.upsert({ where: { id: 1 }, update: {}, create: {
      id: 1, name: "Synthetic test business", tagline: "Test", description: "Test business",
      location: "Test", contactEmail: "owner@example.test", notificationEmail: "avisos@example.test", primaryColor: "#123456",
      accentColor: "#234567", backgroundColor: "#345678", homeTexts: {},
      cancellationPolicy: "Test policy",
    } });
    await t.test("a transaction rollback leaves no queued notification", async () => {
      await db.$executeRaw`
        CREATE OR REPLACE FUNCTION test_fail_booking_submission() RETURNS trigger AS $$
        BEGIN
          RAISE EXCEPTION 'synthetic transaction rollback';
        END;
        $$ LANGUAGE plpgsql
      `;
      await db.$executeRaw`
        CREATE TRIGGER test_fail_booking_submission
        BEFORE INSERT ON "BookingSubmission"
        FOR EACH ROW EXECUTE FUNCTION test_fail_booking_submission()
      `;
      const email = `rollback-${randomUUID()}@example.test`;
      const ownerNotificationsBefore = await db.notificationOutbox.count({ where: { recipient: "avisos@example.test" } });
      try {
        const visitor = createHash("sha256").update(randomUUID()).digest("hex");
        await assert.rejects(submitIdempotently("Rollback Test", email, "2035-02-01", randomUUID(), visitor),
          /synthetic transaction rollback/);
        assert.equal(await db.bookingRequest.count({ where: { cabinId, guestEmail: email } }), 0);
        assert.equal(await db.notificationOutbox.count({ where: { recipient: "avisos@example.test" } }), ownerNotificationsBefore);
      } finally {
        await db.$executeRaw`DROP TRIGGER IF EXISTS test_fail_booking_submission ON "BookingSubmission"`;
        await db.$executeRaw`DROP FUNCTION IF EXISTS test_fail_booking_submission()`;
      }
    });
    await t.test("idempotent retry does not duplicate its notification and confirmation queues exactly one", async () => {
      const email = `idempotent-${randomUUID()}@example.test`;
      const key = randomUUID(), visitor = createHash("sha256").update(randomUUID()).digest("hex");
      await submitIdempotently("Idempotent Test", email, "2035-03-01", key, visitor);
      const created = await db.bookingRequest.findFirstOrThrow({ where: { cabinId, guestEmail: email } });
      const creationNotice = await db.notificationOutbox.findUniqueOrThrow({
        where: { requestId_event: { requestId: created.id, event: "REQUEST_CREATED" } },
      });
      assert.equal(creationNotice.recipient, "avisos@example.test");
      await submitIdempotently("Idempotent Test", email, "2035-03-01", key, visitor);
      assert.equal(await db.notificationOutbox.count({ where: { requestId: created.id, event: "REQUEST_CREATED" } }), 1);
      await changeRequestStatus(db, created.id, "CONFIRMED");
      assert.equal(await db.notificationOutbox.count({ where: { requestId: created.id, event: "REQUEST_CONFIRMED" } }), 1);
      await clear();
    });
    await t.test("SMTP connection failure retries twice and then records a terminal error", async () => {
      await clear();
      const failedRequest = await request();
      const notification = await db.notificationOutbox.create({ data: {
        requestId: failedRequest.id,
        event: "REQUEST_CREATED",
        recipient: "guest@example.test",
        nextAttemptAt: new Date(0),
        payload: {
          businessName: "Synthetic test business",
          cabinName: "Synthetic test cabin",
          guestName: "SMTP Test",
          guestEmail: "guest@example.test",
          guestPhone: null,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          guests: 1,
          estimatedTotalClp: 2000,
          currency: "CLP",
          contactEmail: "owner@example.test",
          contactPhone: null,
          timezone: "America/Santiago",
        },
      } });
      const envNames = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM", "SMTP_SECURE"] as const;
      const previous = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
      Object.assign(process.env, {
        SMTP_HOST: "127.0.0.1",
        SMTP_PORT: "1",
        SMTP_USER: "",
        SMTP_PASSWORD: "",
        SMTP_FROM: "Cabañas <sender@example.test>",
        SMTP_SECURE: "false",
      });
      try {
        const dueCheck = await db.$queryRaw<{ due: boolean; status: string }[]>`
          SELECT "nextAttemptAt" <= NOW() AS due, "status"::text AS status
          FROM "NotificationOutbox" WHERE "id" = ${notification.id}::uuid
        `;
        assert.deepEqual(dueCheck, [{ due: true, status: "PENDING" }]);
        const first = await sendPendingNotifications(db);
        assert.ok(first.failed >= 1, JSON.stringify({ first, notification: await db.notificationOutbox.findUnique({ where: { id: notification.id } }) }));
        const afterFirst = await db.notificationOutbox.findUniqueOrThrow({ where: { id: notification.id } });
        assert.equal(afterFirst.status, "PENDING");
        assert.equal(afterFirst.attempts, 1);
        assert.ok(afterFirst.lastError);
        await db.notificationOutbox.update({ where: { id: notification.id }, data: { nextAttemptAt: new Date(0) } });
        const second = await sendPendingNotifications(db);
        assert.equal(second.failed, 1);
        const afterSecond = await db.notificationOutbox.findUniqueOrThrow({ where: { id: notification.id } });
        assert.equal(afterSecond.status, "PENDING");
        assert.equal(afterSecond.attempts, 2);
        await db.notificationOutbox.update({ where: { id: notification.id }, data: { nextAttemptAt: new Date(0) } });
        const third = await sendPendingNotifications(db);
        assert.equal(third.failed, 1);
        const afterThird = await db.notificationOutbox.findUniqueOrThrow({ where: { id: notification.id } });
        assert.equal(afterThird.status, "ERROR");
        assert.equal(afterThird.attempts, 3);
        assert.ok(afterThird.lastError);
      } finally {
        for (const name of envNames) {
          const value = previous[name];
          if (value === undefined) delete process.env[name];
          else process.env[name] = value;
        }
        await clear();
      }
    });
    await t.test("pending requests do not occupy; two concurrent confirmations yield one winner", async () => {
      const a = await request(), b = await request();
      assert.equal(await db.occupancy.count({ where: { cabinId } }), 0);
      const results = await Promise.allSettled([changeRequestStatus(db, a.id, "CONFIRMED"), changeRequestStatus(db, b.id, "CONFIRMED")]);
      assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
      assert.equal(await db.bookingRequest.count({ where: { cabinId, status: "CONFIRMED" } }), 1);
      assert.equal(await db.occupancy.count({ where: { cabinId } }), 1);
      await clear();
    });
    await t.test("database triggers prevent overlapping direct concurrent updates", async () => {
      const a = await request(), b = await request();
      const results = await Promise.allSettled([a, b].map(r => db.bookingRequest.update({ where: { id: r.id }, data: { status: "CONFIRMED" } })));
      assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
      const failure = results.find(r => r.status === "rejected");
      assert.ok(failure && failure.status === "rejected");
      assert.match(String(failure.reason), /occupancy_no_overlap|23P01/);
      assert.equal(await db.occupancy.count({ where: { cabinId } }), 1);
      await clear();
    });
    await t.test("manual block and confirmation race for the same interval", async () => {
      const a = await request();
      const results = await Promise.allSettled([
        changeRequestStatus(db, a.id, "CONFIRMED"),
        createManualBlock(db, { cabinId, startsAt, endsAt, reason: "Synthetic maintenance" }),
      ]);
      assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
      assert.equal(await db.occupancy.count({ where: { cabinId } }), 1);
      await clear();
    });
    await t.test("exclusive end, cancellation and block removal release occupation", async () => {
      const a = await request();
      await changeRequestStatus(db, a.id, "CONFIRMED");
      const b = await request(endsAt, new Date("2035-01-01T18:00Z"));
      await changeRequestStatus(db, b.id, "CONFIRMED");
      assert.equal(await db.occupancy.count({ where: { cabinId } }), 2);
      await changeRequestStatus(db, a.id, "CANCELLED");
      const block = await createManualBlock(db, { cabinId, startsAt, endsAt, reason: "Synthetic maintenance" });
      await removeManualBlock(db, block.id);
      assert.equal(await db.occupancy.count({ where: { cabinId } }), 1);
      await clear();
    });
    await t.test("database rejects invalid capacity, modality, season overlaps and projection writes", async () => {
      const a = await request();
      await assert.rejects(db.bookingRequest.update({ where: { id: a.id }, data: { guests: 3 } }));
      await assert.rejects(db.cabin.update({ where: { id: cabinId }, data: { mode: "NIGHTLY" } }));
      await assert.rejects(db.occupancy.create({ data: { cabinId, startsAt, endsAt, requestId: a.id } }));
      await db.seasonalRate.create({ data: { cabinId, name: "Test season", startDate: new Date("2035-01-01Z"), endDate: new Date("2035-01-10Z"), rateClp: 100 } });
      await assert.rejects(db.seasonalRate.create({ data: { cabinId, name: "Overlap", startDate: new Date("2035-01-05Z"), endDate: new Date("2035-01-11Z"), rateClp: 100 } }));
      await clear();
    });
    await t.test("block update collision rolls back interval and occupation together", async () => {
      const a = await createManualBlock(db, { cabinId, startsAt, endsAt, reason: "Test A" });
      const b = await createManualBlock(db, { cabinId, startsAt: endsAt, endsAt: new Date("2035-01-01T18:00Z"), reason: "Test B" });
      await assert.rejects(db.manualBlock.update({ where: { id: b.id }, data: { startsAt } }));
      const unchanged = await db.manualBlock.findUniqueOrThrow({ where: { id: b.id }, include: { occupancy: true } });
      assert.equal(+unchanged.startsAt, +endsAt);
      assert.equal(+unchanged.occupancy!.startsAt, +endsAt);
      await removeManualBlock(db, a.id);
      await removeManualBlock(db, b.id);
      assert.equal(await db.occupancy.count({ where: { cabinId } }), 0);
    });
  } finally {
    await clear();
    await db.cabin.deleteMany({ where: { id: cabinId } });
    await db.$disconnect();
  }
});
