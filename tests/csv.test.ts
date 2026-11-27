import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRequestsCsv, escapeCsvValue } from "../src/modules/bookings/csv";

test("CSV values quote delimiters and neutralize formula prefixes", () => {
  for (const prefix of ["=", "+", "-", "@"])
    assert.equal(escapeCsvValue(`${prefix}SUM(A1:A2)`), `"'${prefix}SUM(A1:A2)"`);
  assert.equal(escapeCsvValue('Cabaña, "sur"'), '"Cabaña, ""sur"""');
  assert.equal(escapeCsvValue(12000), '"12000"');
});

test("export has UTF-8 BOM and renders timestamps in Santiago time", () => {
  const csv = buildRequestsCsv([{ cabin: "Cabaña Ñ", mode: "NIGHTLY", startsAt: new Date("2026-11-27T15:00:00Z"),
    endsAt: new Date("2026-11-28T15:00:00Z"), guests: 2, name: "Ana", email: "ana@example.test", phone: null,
    status: "PENDING", totalClp: 85000, createdAt: new Date("2026-11-20T12:30:00Z") }]);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes('"2026-11-27T12:00"'));
  assert.ok(csv.includes('"2026-11-20T09:30"'));
  assert.ok(csv.includes('"Cabaña Ñ"'));
});
