import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseCleanupArgs } from "../src/modules/maintenance/cli-args";
import { subtractCalendarMonths } from "../src/modules/maintenance/cleanup";

const tsx = resolve("node_modules/tsx/dist/cli.mjs");
const script = resolve("scripts/maintenance-cleanup.ts");
const run = (args: string[], databaseUrl: string) => spawnSync(process.execPath, [tsx, script, ...args], {
  encoding: "utf8",
  env: { ...process.env, DATABASE_URL: databaseUrl, TEST_DATABASE_URL: "", SMTP_PASSWORD: "" },
});

test("cleanup arguments have safe defaults and reject invalid input", () => {
  assert.deepEqual(parseCleanupArgs([]), { apply: false, batchSize: 500, help: false });
  assert.deepEqual(parseCleanupArgs(["--apply", "--batch-size=50"]), { apply: true, batchSize: 50, help: false });
  for (const bad of [["--batch-size=0"], ["--batch-size=10001"], ["--batch-size=abc"], ["--batch-size=1.5"], ["--force"], ["apply"]]) {
    assert.throws(() => parseCleanupArgs(bad), Error, bad.join(" "));
  }
});

test("booking retention subtracts Santiago calendar months and clamps month ends", () => {
  assert.equal(subtractCalendarMonths(new Date("2026-11-04T12:00:00.000Z"), 2).toISOString(), "2026-09-04T13:00:00.000Z");
  assert.equal(subtractCalendarMonths(new Date("2026-03-31T12:00:00.000Z"), 1).toISOString(), "2026-02-28T12:00:00.000Z");
});

test("cleanup command exits with code 2 on invalid arguments", () => {
  const result = run(["--force"], "postgresql://cabanias_local:synthetic-secret@127.0.0.1:54329/cabanias_dev?schema=public");
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Uso: npm run maintenance:cleanup/);
});

test("cleanup command rejects remote and test destinations before connecting, without leaking secrets", () => {
  for (const url of [
    "postgresql://cabanias_local:synthetic-secret@database.example.com:5432/cabanias_dev?schema=public",
    "postgresql://cabanias_local:synthetic-secret@127.0.0.1:54330/cabanias_test?schema=public",
  ]) {
    for (const args of [[], ["--apply"]]) {
      const result = run(args, url);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Destino rechazado/);
      assert.ok(!result.stdout.includes("synthetic-secret") && !result.stderr.includes("synthetic-secret"));
    }
  }
});

test("cleanup retains booking records and idempotency relationships while anonymizing only personal fields", () => {
  const source = readFileSync("src/modules/maintenance/cleanup.ts", "utf8");
  assert.ok(!source.includes("BookingSubmission") && !source.includes("bookingSubmission"));
  assert.match(source, /UPDATE "BookingRequest"/);
  assert.match(source, /"guestName" = 'Solicitud anonimizada'/);
  assert.match(source, /"guestEmail" = 'anonimizado\+'/);
  assert.match(source, /"guestPhone" = NULL/);
  assert.doesNotMatch(source, /DELETE FROM "BookingRequest"/);
});
