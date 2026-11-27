import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { changeRequestStatus, createManualBlock, removeManualBlock } from "../src/modules/bookings/service";
import { deleteCabin } from "../src/modules/management/service";
import { assertLocalUrl } from "../scripts/local-db-safety.mjs";
import { calendarFeedResponse, issueCalendarFeed } from "../src/modules/calendar-feed/service";
import { hashFeedToken } from "../src/modules/calendar-feed/token";
import { formatUtc } from "../src/modules/calendar-feed/ical";

const GUEST = { name: "Huésped Secreto Zeta", email: "secreto.zeta@example.test", phone: "+56900000017" };
const REASON = "Mantención Privada Omega";

test("calendar feed serves only occupancy, hides personal data and rotates tokens", { skip: !process.env.TEST_DATABASE_URL }, async t => {
  assertLocalUrl(process.env.TEST_DATABASE_URL, "test");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL! }) });
  const cabinA = randomUUID(), cabinB = randomUUID(), cabinC = randomUUID();
  const cabinIds = [cabinA, cabinB, cabinC];
  const hour = 3_600_000, day = 86_400_000, base = Date.now() + 400 * day;
  const at = (offsetHours: number) => new Date(Math.floor(base / hour) * hour + offsetHours * hour);
  const request = (cabinId: string, start: Date, end: Date) => db.bookingRequest.create({ data: {
    cabinId, mode: "HOURLY", startsAt: start, endsAt: end, guests: 1, guestName: GUEST.name, guestEmail: GUEST.email,
    guestPhone: GUEST.phone, estimatedTotalClp: 987654, pricingSnapshot: { test: true } } });
  const clear = async () => {
    const requests = await db.bookingRequest.findMany({ where: { cabinId: { in: cabinIds } }, select: { id: true } });
    const requestIds = requests.map(row => row.id);
    await db.notificationOutbox.deleteMany({ where: { requestId: { in: requestIds } } });
    await db.bookingRequest.deleteMany({ where: { cabinId: { in: cabinIds } } });
    await db.manualBlock.deleteMany({ where: { cabinId: { in: cabinIds } } });
    await db.cabin.deleteMany({ where: { id: { in: cabinIds } } });
  };
  const fetchFeed = async (file: string) => {
    const response = await calendarFeedResponse(db, file);
    return { response, text: await response.text() };
  };
  const events = (text: string) => text.split("BEGIN:VEVENT\r\n").slice(1);
  try {
    await clear();
    for (const [id, name, status] of [[cabinA, "Cabaña Feed A", "PUBLISHED"], [cabinB, "Cabaña Feed B", "PUBLISHED"], [cabinC, "Cabaña Feed C", "DRAFT"]] as const) {
      await db.cabin.create({ data: { id, slug: `feed-${id}`, name, description: "Disposable fixture", mode: "HOURLY",
        capacity: 2, bedrooms: 1, publicationStatus: status, baseRateClp: 1000 } });
    }
    await db.businessSettings.upsert({ where: { id: 1 }, update: {}, create: {
      id: 1, name: "Synthetic test business", tagline: "Test", description: "Test business",
      location: "Test", contactEmail: "owner@example.test", notificationEmail: "avisos@example.test", primaryColor: "#123456",
      accentColor: "#234567", backgroundColor: "#345678", homeTexts: {}, cancellationPolicy: "Test policy",
    } });
    const confirmed = await request(cabinA, at(0), at(2));
    await changeRequestStatus(db, confirmed.id, "CONFIRMED");
    const pending = await request(cabinA, at(10), at(12));
    const rejected = await request(cabinA, at(20), at(22));
    await changeRequestStatus(db, rejected.id, "REJECTED");
    const cancelled = await request(cabinA, at(30), at(32));
    await changeRequestStatus(db, cancelled.id, "CONFIRMED");
    await changeRequestStatus(db, cancelled.id, "CANCELLED");
    const block = await createManualBlock(db, { cabinId: cabinA, startsAt: at(40), endsAt: at(44), reason: REASON });
    const other = await request(cabinB, at(0), at(2));
    await changeRequestStatus(db, other.id, "CONFIRMED");
    const old = await db.manualBlock.create({ data: { cabinId: cabinA, startsAt: new Date(Date.now() - 101 * day), endsAt: new Date(Date.now() - 100 * day), reason: "Bloqueo antiguo" } });
    const occupancy = await db.occupancy.findMany({ where: { cabinId: cabinA }, select: { id: true, startsAt: true, endsAt: true, requestId: true, blockId: true } });
    const occupancyOf = (key: "requestId" | "blockId", id: string) => occupancy.find(row => row[key] === id)!;
    const issued = await issueCalendarFeed(db, cabinA);
    const file = `${issued.token}.ics`;

    await t.test("issues a hashed token and serves the feed with private headers", async () => {
      const row = await db.cabinCalendarFeed.findUniqueOrThrow({ where: { cabinId: cabinA } });
      assert.equal(row.tokenHash, hashFeedToken(issued.token));
      assert.ok(!JSON.stringify(row).includes(issued.token));
      const { response, text } = await fetchFeed(file);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-type"), "text/calendar; charset=utf-8");
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(response.headers.get("referrer-policy"), "no-referrer");
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
      assert.ok(!(response.headers.get("content-disposition") ?? "").includes(issued.token));
      assert.ok(text.startsWith("BEGIN:VCALENDAR\r\n"));
    });
    await t.test("contains exactly the confirmed booking and the current block", async () => {
      const { text } = await fetchFeed(file);
      const blocks = events(text);
      assert.equal(blocks.length, 2);
      const expected = [occupancyOf("requestId", confirmed.id), occupancyOf("blockId", block.id)];
      for (const row of expected) {
        const found = blocks.find(item => item.includes(`UID:${row.id}@cabanias-ocupacion`));
        assert.ok(found, row.id);
        assert.ok(found.includes(`DTSTART:${formatUtc(row.startsAt)}`) && found.includes(`DTEND:${formatUtc(row.endsAt)}`));
      }
      for (const row of [pending, rejected, cancelled, other, old]) assert.ok(!text.includes(row.id));
      assert.ok(!text.includes(formatUtc(at(10))) && !text.includes(formatUtc(at(20))) && !text.includes(formatUtc(at(30))));
    });
    await t.test("does not leak guest data, block reasons, ids or amounts", async () => {
      const { text } = await fetchFeed(file);
      for (const secret of [GUEST.name, GUEST.name.toLowerCase(), GUEST.email, GUEST.phone, "900000017", REASON, confirmed.id, block.id,
        String(confirmed.estimatedTotalClp), "estimatedTotalClp", "PENDING", "guest", "Cabaña Feed B"]) {
        assert.ok(!text.includes(secret), `leaked ${secret}`);
      }
    });
    await t.test("serves the feed of a cabin that is not published", async () => {
      const draft = await issueCalendarFeed(db, cabinC);
      const { response } = await fetchFeed(`${draft.token}.ics`);
      assert.equal(response.status, 200);
    });
    let rotated: string;
    await t.test("rotation invalidates the previous token and keeps a single row", async () => {
      const before = await db.cabinCalendarFeed.findUniqueOrThrow({ where: { cabinId: cabinA } });
      const second = await issueCalendarFeed(db, cabinA, new Date(Date.now() + 1000));
      rotated = second.token;
      assert.notEqual(second.token, issued.token);
      assert.equal((await fetchFeed(file)).response.status, 404);
      assert.equal((await fetchFeed(`${second.token}.ics`)).response.status, 200);
      assert.equal(await db.cabinCalendarFeed.count({ where: { cabinId: cabinA } }), 1);
      const after = await db.cabinCalendarFeed.findUniqueOrThrow({ where: { cabinId: cabinA } });
      assert.ok(+after.rotatedAt > +before.rotatedAt);
      assert.equal(+after.createdAt, +before.createdAt);
    });
    await t.test("every kind of invalid token produces an identical 404", async () => {
      const samples = ["abc.ics", rotated, `${rotated}.ICS`, `${"z".repeat(43)}.ics`, file];
      const results = [];
      for (const sample of samples) {
        const response = await calendarFeedResponse(db, sample);
        results.push({ status: response.status, headers: [...response.headers].sort(), body: Buffer.from(await response.arrayBuffer()) });
      }
      for (const result of results) assert.deepEqual(result, results[0]);
      assert.equal(results[0].status, 404);
      assert.ok(!results[0].body.toString().includes("Cabaña"));
    });
    await t.test("changes follow cancellations, block removal and cabin deletion", async () => {
      const current = `${rotated}.ics`;
      await changeRequestStatus(db, confirmed.id, "CANCELLED");
      let { text } = await fetchFeed(current);
      assert.equal(events(text).length, 1);
      await removeManualBlock(db, block.id);
      ({ text } = await fetchFeed(current));
      assert.equal(events(text).length, 0);
      await issueCalendarFeed(db, cabinC);
      await deleteCabin(db, cabinC);
      assert.equal(await db.cabinCalendarFeed.count({ where: { cabinId: cabinC } }), 0);
    });
  } finally {
    await clear();
    await db.$disconnect();
  }
});
