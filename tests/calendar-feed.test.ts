import { test } from "node:test";
import assert from "node:assert/strict";
import { Temporal } from "@js-temporal/polyfill";
import { buildCalendar, escapeText, formatUtc } from "../src/modules/calendar-feed/ical";
import { hashFeedToken, newFeedToken, parseFeedFile } from "../src/modules/calendar-feed/token";
import { estimateStay } from "../src/modules/bookings/domain";
import { blockInterval } from "../src/modules/bookings/calendar";

const now = new Date("2026-11-27T12:00:00.000Z");
const hours = { checkInHour: 15, checkOutHour: 11 };
const event = (n: number, startsAt = "2026-05-01T15:00:00Z", endsAt = "2026-05-03T15:00:00Z") =>
  ({ uid: `00000000-0000-4000-8000-00000000000${n}`, startsAt: new Date(startsAt), endsAt: new Date(endsAt) });
const nightly = (arrivalDate: string, departureDate: string) =>
  estimateStay({ mode: "NIGHTLY", arrivalDate, departureDate }, { mode: "NIGHTLY", baseRateClp: 1000 }, [], hours);
const hourly = (startsAt: string, endsAt: string) =>
  estimateStay({ mode: "HOURLY", startsAt, endsAt }, { mode: "HOURLY", baseRateClp: 1000 }, [], hours);
const feedLines = (...events: ReturnType<typeof event>[]) => buildCalendar("Cabaña", events, now).split("\r\n");
const times = (range: { startsAt: Date; endsAt: Date }) => ({ start: `DTSTART:${formatUtc(range.startsAt)}`, end: `DTEND:${formatUtc(range.endsAt)}` });

test("calendar output is valid RFC 5545 for 0, 1 and 3 events", () => {
  for (const count of [0, 1, 3]) {
    const body = buildCalendar("Cabaña Uno", Array.from({ length: count }, (_, i) => event(i + 1)), now);
    assert.ok(body.startsWith("BEGIN:VCALENDAR\r\n") && body.endsWith("END:VCALENDAR\r\n"));
    assert.doesNotMatch(body, /(?<!\r)\n/);
    for (const needle of ["VERSION:2.0", "PRODID:", "CALSCALE:GREGORIAN"]) assert.ok(body.includes(needle));
    assert.equal(body.match(/^BEGIN:/gm)!.length, body.match(/^END:/gm)!.length);
    const events = body.split("BEGIN:VEVENT\r\n").slice(1);
    assert.equal(events.length, count);
    for (const block of events) {
      for (const key of ["UID:", "DTSTAMP:", "DTSTART:", "DTEND:"]) assert.equal(block.split("\r\n").filter(l => l.startsWith(key)).length, 1);
      assert.equal(block.split("\r\n").filter(l => l === "SUMMARY:Ocupado").length, 1);
    }
    assert.doesNotMatch(body, /VTIMEZONE|TZID|DESCRIPTION|LOCATION|ATTENDEE|ORGANIZER/);
    for (const line of body.split("\r\n").filter(l => /^DT(START|END)/.test(l))) assert.match(line, /^DT(START|END):\d{8}T\d{6}Z$/);
  }
});
test("long multibyte lines fold at 75 octets without breaking UTF-8", () => {
  const name = "Cabaña ñandú · ".repeat(20);
  const body = buildCalendar(name, [], now);
  const physical = body.split("\r\n");
  for (const line of physical) assert.ok(Buffer.byteLength(line) <= 75, line);
  assert.ok(physical.some(line => line.startsWith(" ")));
  for (const line of physical.filter(l => l.startsWith(" "))) assert.doesNotMatch(line, /^ [ \t]/);
  const unfolded = body.replace(/\r\n[ \t]/g, "").split("\r\n").find(l => l.startsWith("X-WR-CALNAME:"));
  assert.equal(unfolded, `X-WR-CALNAME:${escapeText(name)}`);
  assert.equal(Buffer.from(body).toString(), body);
  assert.ok(!body.includes("�"));
});
test("text escaping covers backslash, semicolon, comma and newline", () => {
  assert.equal(escapeText("Refugio, lago; norte\\sur\nvista"), "Refugio\\, lago\\; norte\\\\sur\\nvista");
  assert.equal(escapeText("a\u0000b\u0007c\r\nd"), "abc\\nd");
});
test("time zone data matches the Chilean DST rules used by the feed", () => {
  const offset = (iso: string) => Temporal.PlainDateTime.from(iso).toZonedDateTime("America/Santiago").offset;
  assert.equal(offset("2026-04-04T12:00"), "-03:00");
  assert.equal(offset("2026-04-05T12:00"), "-04:00");
  assert.equal(offset("2026-09-05T12:00"), "-04:00");
  assert.equal(offset("2026-09-06T12:00"), "-03:00");
});
test("feed instants stay exact across Santiago DST changes", () => {
  const cases: [{ startsAt: Date; endsAt: Date }, string, string][] = [
    [nightly("2026-04-03", "2026-04-06"), "20260403T180000Z", "20260406T150000Z"],
    [nightly("2026-09-05", "2026-09-07"), "20260905T190000Z", "20260907T140000Z"],
    [nightly("2027-04-02", "2027-04-05"), "20270402T180000Z", "20270405T150000Z"],
    [nightly("2027-09-04", "2027-09-06"), "20270904T190000Z", "20270906T140000Z"],
    [hourly("2026-04-04T23:00:00-03:00", "2026-04-05T01:00:00-04:00"), "20260405T020000Z", "20260405T050000Z"],
    [hourly("2026-09-05T23:00:00-04:00", "2026-09-06T02:00:00-03:00"), "20260906T030000Z", "20260906T050000Z"],
    [blockInterval("2027-04-03T22:00", "2027-04-04T01:00"), "20270404T010000Z", "20270404T050000Z"],
  ];
  for (const [range, start, end] of cases) {
    const lines = feedLines({ uid: "x", startsAt: range.startsAt, endsAt: range.endsAt });
    assert.ok(lines.includes(`DTSTART:${start}`), `${start} in ${lines.join(" ")}`);
    assert.ok(lines.includes(`DTEND:${end}`), end);
  }
  assert.throws(() => blockInterval("2027-04-03T23:30", "2027-04-04T05:00"));
});
test("DTEND is the stored exit and contiguous events share the boundary", () => {
  const first = event(1, "2026-04-08T15:00:00Z", "2026-04-10T15:00:00Z"), second = event(2, "2026-04-10T15:00:00Z", "2026-04-12T15:00:00Z");
  const lines = feedLines(first, second);
  assert.ok(lines.includes(times(first).end) && lines.includes("DTSTART:20260410T150000Z") && lines.includes("DTEND:20260410T150000Z"));
});
test("feed tokens are random, hashed deterministically and strictly parsed", () => {
  const token = newFeedToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(token, newFeedToken());
  const hash = hashFeedToken(token);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hash, hashFeedToken(token));
  assert.ok(!hash.includes(token));
  assert.equal(parseFeedFile(`${token}.ics`), token);
  const t = "a".repeat(43);
  for (const bad of [t, `${t}.ICS`, `${t}.ics.ics`, `${"a".repeat(42)}.ics`, `${"a".repeat(44)}.ics`, `${"a".repeat(42)}+.ics`,
    `${"a".repeat(42)}/.ics`, `${"a".repeat(42)}=.ics`, `../${t}.ics`, "", ".ics"]) assert.equal(parseFeedFile(bad), null, bad);
});
