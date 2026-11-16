import { test } from "node:test";
import assert from "node:assert/strict";
import { assertTransition, estimateStay, interval, overlaps, validateGuest } from "../src/modules/bookings/domain";
import { publicStayInput } from "../src/modules/bookings/public-input";
import { requestFilters, storedBreakdown } from "../src/modules/bookings/admin-view";
import { calendarWindow, blockInterval } from "../src/modules/bookings/calendar";

const hours = { checkInHour: 15, checkOutHour: 11 };
test("calendar windows follow Santiago calendar boundaries and exclusive overlap", () => {
  const month = calendarWindow("NIGHTLY", "2036-02-10");
  assert.equal(month.days.length, 29);
  assert.equal(month.first, "2036-02-01");
  assert.equal(month.previous, "2036-01-01");
  assert.equal(month.next, "2036-03-01");
  const day = calendarWindow("HOURLY", "2026-09-06");
  assert.equal((+day.endsAt - +day.startsAt) / 3600000, 23);
  assert.throws(() => calendarWindow("HOURLY", "2030-02-30"));
  assert.throws(() => blockInterval("2026-09-06T00:00", "2026-09-06T03:00"));
  assert.throws(() => blockInterval("2036-01-01T13:00", "2036-01-01T12:00"));
  const a = blockInterval("2036-01-01T10:00", "2036-01-01T12:00");
  const b = blockInterval("2036-01-01T12:00", "2036-01-01T13:00");
  assert.equal(overlaps(a,b),false);
});
test("administrative date filters cover local calendar days including the Santiago DST gap", () => {
  const filters = requestFilters({ status: "PENDING", from: "2026-09-06", to: "2026-09-06" });
  assert.equal(filters.from?.toISOString(), "2026-09-06T04:00:00.000Z");
  assert.equal(filters.until?.toISOString(), "2026-09-07T03:00:00.000Z");
  assert.equal(filters.page, 1);
  for (const query of [{ status: "UNKNOWN" }, { from: "2030-02-30" }, { from: "2030-01-02", to: "2030-01-01" }, { page: "0" }, { status: ["PENDING", "CONFIRMED"] }]) {
    assert.throws(() => requestFilters(query));
  }
});
test("saved breakdown groups stored units without reading current rates and tolerates legacy snapshots", () => {
  assert.deepEqual(storedBreakdown({ lines: [{ date: "2030-01-01", rateClp: 1000, units: 1, seasonId: null }, { date: "2030-01-01", rateClp: 1000, units: 1, seasonId: null }] }),
    [{ date: "2030-01-01", rateClp: 1000, units: 2, seasonal: false }]);
  assert.equal(storedBreakdown({ legacy: true }), null);
});
test("public hourly input uses Santiago, elapsed whole hours and rejects invalid or skipped times", () => {
  const form = (values: Record<string, string>) => {
    const result = new FormData();
    for (const [key, value] of Object.entries({ mode: "HOURLY", guests: "2", date: "2026-09-05", hour: "23", duration: "2", ...values })) result.set(key, value);
    return result;
  };
  const input = publicStayInput(form({}));
  assert.equal(input.stay.mode, "HOURLY");
  if (input.stay.mode === "HOURLY") {
    assert.equal(input.stay.startsAt, "2026-09-06T03:00:00Z");
    assert.equal(input.stay.endsAt, "2026-09-06T05:00:00Z");
  }
  const invalidCases: Record<string, string>[] = [{ duration: "1.5" }, { duration: "0" }, { hour: "24" }, { mode: "BOTH" },
    { date: "2030-02-30" }, { date: "2026-09-06", hour: "0" }, { guests: "0" }];
  for (const invalid of invalidCases) {
    assert.throws(() => publicStayInput(form(invalid)));
  }
});
test("half-open intervals allow adjacent stays but reject empty intervals", () => {
  const a = interval(new Date("2030-01-01T10:00Z"), new Date("2030-01-01T11:00Z"));
  assert.equal(overlaps(a, interval(a.endsAt, new Date("2030-01-01T12:00Z"))), false);
  assert.equal(overlaps(a, interval(new Date("2030-01-01T10:30Z"), a.endsAt)), true);
  assert.throws(() => interval(a.startsAt, a.startsAt));
});
test("nightly estimate charges each local night and snapshots seasons with exclusive end", () => {
  const estimate = estimateStay({ mode: "NIGHTLY", arrivalDate: "2030-01-01", departureDate: "2030-01-04" },
    { mode: "NIGHTLY", baseRateClp: 10000 }, [{ id: "summer", startDate: new Date("2030-01-02Z"), endDate: new Date("2030-01-03Z"), rateClp: 20000 }], hours);
  assert.equal(estimate.totalClp, 40000);
  assert.deepEqual(estimate.snapshot.lines.map(l => l.rateClp), [10000, 20000, 10000]);
  assert.equal(estimate.startsAt.toISOString(), "2030-01-01T18:00:00.000Z");
  assert.equal(estimate.endsAt.toISOString(), "2030-01-04T14:00:00.000Z");
});
test("Santiago DST: calendar nights differ from elapsed hours", () => {
  // 2026-09-06 skips local midnight. One night still costs one nightly rate.
  const night = estimateStay({ mode: "NIGHTLY", arrivalDate: "2026-09-05", departureDate: "2026-09-06" },
    { mode: "NIGHTLY", baseRateClp: 1000 }, [], hours);
  assert.equal(night.totalClp, 1000);
  assert.equal((+night.endsAt - +night.startsAt) / 3600000, 19);
  const hourly = estimateStay({ mode: "HOURLY", startsAt: "2026-09-05T23:00:00-04:00", endsAt: "2026-09-06T02:00:00-03:00" },
    { mode: "HOURLY", baseRateClp: 1000 }, [], hours);
  assert.equal(hourly.totalClp, 2000);
});
test("invalid mode, missing offset, ambiguous local night hour and fractional hours fail", () => {
  assert.throws(() => estimateStay({ mode: "NIGHTLY", arrivalDate: "2030-01-01", departureDate: "2030-01-02" }, { mode: "HOURLY", baseRateClp: 1 }, [], hours));
  for (const startsAt of ["2030-01-01T10:00:00", "2030-01-01T10:30:00Z"]) {
    assert.throws(() => estimateStay({ mode: "HOURLY", startsAt, endsAt: "2030-01-01T15:00:00Z" }, { mode: "HOURLY", baseRateClp: 1 }, [], hours));
  }
  assert.throws(() => estimateStay({ mode: "NIGHTLY", arrivalDate: "2026-09-06", departureDate: "2026-09-07" },
    { mode: "NIGHTLY", baseRateClp: 1 }, [], { checkInHour: 0, checkOutHour: 11 }));
});
test("hourly seasons use Santiago date rather than UTC date", () => {
  const quote = estimateStay({ mode: "HOURLY", startsAt: "2030-01-02T01:00Z", endsAt: "2030-01-02T04:00Z" },
    { mode: "HOURLY", baseRateClp: 10 }, [{ id: "s", startDate: new Date("2030-01-02Z"), endDate: new Date("2030-01-03Z"), rateClp: 20 }], hours);
  assert.equal(quote.totalClp, 40);
});
test("capacity, guest fields, transitions, overlapping seasons and CLP overflow", () => {
  const guest = { guestName: " Test ", guestEmail: " EXAMPLE@example.test ", guests: 2 };
  assert.equal(validateGuest(guest, 2).guestEmail, "example@example.test");
  assert.throws(() => validateGuest(guest, 1));
  assert.throws(() => validateGuest({ ...guest, guestEmail: "bad" }, 2));
  assertTransition("PENDING", "CONFIRMED");
  assertTransition("CONFIRMED", "CANCELLED");
  assert.throws(() => assertTransition("REJECTED", "CONFIRMED"));
  const stay = { mode: "NIGHTLY" as const, arrivalDate: "2030-01-01", departureDate: "2030-01-03" };
  assert.throws(() => estimateStay(stay, { mode: "NIGHTLY", baseRateClp: 2147483647 }, [], hours));
  const season = { id: "s", startDate: new Date("2030-01-01Z"), endDate: new Date("2030-01-04Z"), rateClp: 1 };
  assert.throws(() => estimateStay(stay, { mode: "NIGHTLY", baseRateClp: 1 }, [season, { ...season, id: "s2" }], hours));
});
