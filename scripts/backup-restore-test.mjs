import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { assertLocalUrl } from "./local-db-safety.mjs";

const sourceValue = process.env.TEST_DATABASE_URL;
if (!sourceValue) throw new Error("Define TEST_DATABASE_URL para cabanias_test local.");
assertLocalUrl(sourceValue, "test");
const source = new URL(sourceValue);
source.hostname = "host.docker.internal";
source.searchParams.delete("schema");
const temp = mkdtempSync(join(tmpdir(), "cabanias-restore-"));
const name = `cabanias-restore-${randomBytes(5).toString("hex")}`;
const password = randomBytes(20).toString("hex");
const port = String(24000 + randomBytes(2).readUInt16BE() % 30000);
const backup = join(temp, "cabanias_test.dump");
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...options });
  if (result.error || result.status !== 0) throw new Error(`${command} falló: ${(result.stderr || result.error?.message || "").slice(-3000)}`);
  return result.stdout;
}
let container = false;
try {
  const dump = spawnSync("docker", ["run", "--rm", "postgres:17-bookworm", "pg_dump", "--format=custom", "--no-owner", "--no-acl", "--dbname", source.href], { encoding: "buffer", maxBuffer: 512 * 1024 * 1024 });
  if (dump.error || dump.status !== 0) throw new Error(`pg_dump falló: ${dump.stderr?.toString().slice(-3000) || dump.error?.message || ""}`);
  writeFileSync(backup, dump.stdout);
  run("docker", ["run", "--detach", "--rm", "--name", name, "--publish", `127.0.0.1:${port}:5432`, "--env", `POSTGRES_PASSWORD=${password}`, "--env", "POSTGRES_DB=cabanias_restore_test", "postgres:17-bookworm"]);
  container = true;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const ready = spawnSync("docker", ["exec", name, "pg_isready", "-U", "postgres", "-d", "cabanias_restore_test"], { stdio: "ignore" });
    if (ready.status === 0) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  const target = `postgresql://postgres:${password}@host.docker.internal:${port}/cabanias_restore_test`;
  run("docker", ["run", "--rm", "--add-host", "host.docker.internal:host-gateway", "--volume", `${temp}:/backup:ro`, "postgres:17-bookworm", "pg_restore", "--no-owner", "--no-acl", "--dbname", target, "/backup/cabanias_test.dump"]);
  const sql = `SELECT (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('request_validation','cabin_terms','request_occupancy','block_lock','block_occupancy','occupancy_internal')) AS triggers, (SELECT count(*) FROM pg_constraint WHERE conname IN ('occupancy_no_overlap','season_no_overlap') AND pg_get_constraintdef(oid) LIKE 'EXCLUDE USING gist%') AS excludes;`;
  const check = run("docker", ["exec", name, "psql", "-U", "postgres", "-d", "cabanias_restore_test", "-At", "-c", sql]).trim();
  if (check !== "6|2") throw new Error(`Se perdieron invariantes tras restaurar (triggers|EXCLUDE): ${check}`);
  // Check the restored exclusion behavior independently; Occupancy's trigger deliberately rejects direct writes.
  const exclude = run("docker", ["exec", name, "psql", "-U", "postgres", "-d", "cabanias_restore_test", "-At", "-c", `SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='occupancy_no_overlap'`]).trim();
  if (!exclude.includes("EXCLUDE USING gist")) throw new Error("No se restauró occupancy_no_overlap.");
  const behavior = spawnSync("docker", ["exec", name, "psql", "-U", "postgres", "-d", "cabanias_restore_test", "-v", "ON_ERROR_STOP=1", "-c", `INSERT INTO "Cabin" (id,slug,name,description,mode,capacity,bedrooms,"publicationStatus","baseRateClp","createdAt","updatedAt") VALUES ('00000000-0000-4000-8000-000000000001','restore-check','Restore check','fixture','HOURLY',2,1,'PUBLISHED',1,NOW(),NOW()); INSERT INTO "ManualBlock" (id,"cabinId","startsAt","endsAt",reason,"createdAt") VALUES ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001','2035-01-01 10:00Z','2035-01-01 12:00Z','a',NOW()), ('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000001','2035-01-01 12:00Z','2035-01-01 14:00Z','b',NOW()); UPDATE "ManualBlock" SET "startsAt"='2035-01-01 11:00Z' WHERE id='00000000-0000-4000-8000-000000000012';`], { encoding: "utf8" });
  if (behavior.status === 0 || !/23P01|exclusion constraint/i.test(behavior.stderr)) throw new Error("La restricción EXCLUDE restaurada no bloqueó el solapamiento.");
  console.log("Respaldo custom de cabanias_test restaurado; 6 triggers y 2 EXCLUDE presentes.");
} finally {
  if (container) spawnSync("docker", ["rm", "--force", name], { stdio: "ignore" });
  rmSync(temp, { recursive: true, force: true });
}
