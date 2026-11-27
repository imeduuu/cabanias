import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { parse } from "dotenv";
import pg from "pg";
import { assertLocalUrl } from "./local-db-safety.mjs";

process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const action = process.argv[2];
function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { stdio: "inherit", env, shell: false });
  if (result.error || result.status !== 0) throw new Error(`Falló ${command} (salida ${result.status ?? "sin proceso"}).`);
}
function composeFiles() {
  if (process.env.CI !== "true") return [];
  if (!process.env.CI_COMPOSE_OVERRIDE) throw new Error("Falta el override temporal de Compose para CI.");
  return ["-f", "compose.yaml", "-f", process.env.CI_COMPOSE_OVERRIDE];
}
function compose(...args) { run("docker", ["compose", ...composeFiles(), ...args]); }
function urlFor(kind) {
  if (process.env.CI === "true") {
    const value = process.env[kind === "test" ? "TEST_DATABASE_URL" : "DATABASE_URL"];
    assertLocalUrl(value, kind);
    return value;
  }
  const password = readFileSync(`.local/${kind}-password`, "utf8").trim();
  return `postgresql://cabanias_local:${password}@127.0.0.1:${kind === "test" ? 54330 : 54329}/cabanias_${kind === "test" ? "test" : "dev"}?schema=public`;
}
function configuredUrl(kind) {
  const key = kind === "test" ? "TEST_DATABASE_URL" : "DATABASE_URL";
  const envFile = process.env.CI === "true" ? {} : (existsSync(".env") ? parse(readFileSync(".env")) : {});
  const value = process.env[key] ?? envFile[key];
  assertLocalUrl(value, kind);
  if (value !== urlFor(kind)) throw new Error(`${key} no coincide con las credenciales locales generadas. No se modificó la base.`);
  return value;
}
async function verify(value, kind) {
  const expected = assertLocalUrl(value, kind);
  const client = new pg.Client({ connectionString: value, connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
    const { rows: [row] } = await client.query("SELECT current_database() AS database, current_user AS username, current_setting('TimeZone') AS timezone");
    if (row.database !== expected.database || row.username !== "cabanias_local" || row.timezone !== "America/Santiago") {
      throw new Error("La identidad del servidor no coincide con el entorno local esperado.");
    }
    const service = kind === "test" ? "postgres-test" : "postgres";
    const identitySql = "SELECT system_identifier::text FROM pg_control_system()";
    const containerIdentity = spawnSync("docker", ["compose", ...composeFiles(), "--profile", "test", "exec", "-T", service,
      "psql", "-U", "cabanias_local", "-d", expected.database, "-Atc", identitySql], { encoding: "utf8" });
    const { rows: [identity] } = await client.query(identitySql);
    if (containerIdentity.status !== 0 || containerIdentity.stdout.trim() !== identity.system_identifier) {
      throw new Error("La conexión no pertenece al contenedor PostgreSQL esperado. Se cancela la operación.");
    }
    console.log(`Destino verificado: 127.0.0.1:${expected.port}/${row.database}; usuario local; zona ${row.timezone}.`);
  } finally { await client.end(); }
}
function migrate(value) {
  run(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"], { ...process.env, DATABASE_URL: value });
}
function runE2e(value) {
  const buildDir = resolve(".local/next-e2e");
  const artifactsDir = resolve(".local/playwright-e2e");
  const reportDir = resolve(".local/playwright-report");
  const localDir = resolve(".local");
  for (const target of [buildDir, artifactsDir, reportDir]) {
    if (!target.startsWith(`${localDir}/`) && !target.startsWith(`${localDir}\\`)) throw new Error("Una carpeta temporal E2E salió de .local.");
  }
  let server;
  let preserveArtifacts = false;
  const rootConfigSnapshot = readFileSync("tsconfig.json");
  const nextEnvSnapshot = readFileSync("next-env.d.ts");
  const secret = randomBytes(48).toString("hex");
  const password = randomBytes(32).toString("base64url");
  const env = { ...process.env, DATABASE_URL: value, TEST_DATABASE_URL: value,
    BETTER_AUTH_SECRET: secret, BETTER_AUTH_URL: "http://127.0.0.1:3102",
    E2E_ADMIN_EMAIL: `e2e-${randomUUID()}@example.test`, E2E_ADMIN_PASSWORD: password,
    E2E_TEST: "1", NODE_ENV: "production" };
  const stopServer = () => {
    if (!server || server.exitCode !== null) return;
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      try { process.kill(-server.pid, "SIGTERM"); } catch { server.kill("SIGTERM"); }
    }
  };
  return (async () => {
    try {
      rmSync(buildDir, { recursive: true, force: true });
      rmSync(artifactsDir, { recursive: true, force: true });
      rmSync(reportDir, { recursive: true, force: true });
      mkdirSync(localDir, { recursive: true });
      compose("--profile", "test", "up", "-d", "--wait", "--force-recreate", "postgres-test");
      await verify(value, "test");
      migrate(value);
      run(process.execPath, [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/seed-e2e.ts")], env);
      run(process.execPath, [resolve("node_modules/next/dist/bin/next"), "build"], env);

      server = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", "3102"], {
        cwd: process.cwd(), env, stdio: "inherit", detached: process.platform !== "win32",
      });
      const deadline = Date.now() + 90_000;
      let ready = false;
      while (Date.now() < deadline) {
        if (server.exitCode !== null) throw new Error("El servidor Next terminó antes de aceptar conexiones.");
        try {
          const response = await fetch("http://127.0.0.1:3102/");
          if (response.ok) { ready = true; break; }
        } catch { /* The server is still starting. */ }
        await delay(500);
      }
      if (!ready) throw new Error("Next no respondió en 127.0.0.1:3102 dentro del plazo.");
      run(process.execPath, [resolve("node_modules/@playwright/test/cli.js"), "test", "--config", "playwright.config.ts", ...process.argv.slice(3)], env);
    } catch (error) {
      preserveArtifacts = true;
      throw error;
    } finally {
      if (server && server.exitCode === null) {
        const exited = new Promise(resolveExit => server.once("exit", resolveExit));
        stopServer();
        await exited;
      }
      try { compose("--profile", "test", "stop", "postgres-test"); } finally {
        try { compose("--profile", "test", "rm", "-f", "postgres-test"); } finally {
          try {
            rmSync(buildDir, { recursive: true, force: true });
            if (process.env.CI !== "true" || !preserveArtifacts) {
              rmSync(artifactsDir, { recursive: true, force: true });
              rmSync(reportDir, { recursive: true, force: true });
            }
          } finally {
            writeFileSync("tsconfig.json", rootConfigSnapshot);
            writeFileSync("next-env.d.ts", nextEnvSnapshot);
          }
        }
      }
    }
  })();
}
async function main() {
  if (action === "setup") {
    const existing = existsSync(".env") ? readFileSync(".env", "utf8") : "";
    const parsed = parse(existing);
    // Do not replace any configured connection, even if it looks local.
    if (parsed.DATABASE_URL || parsed.TEST_DATABASE_URL || process.env.DATABASE_URL || process.env.TEST_DATABASE_URL) {
      configuredUrl("dev"); configuredUrl("test");
      console.log("Configuración local existente validada; secretos conservados."); return;
    }
    mkdirSync(".local", { recursive: true });
    for (const kind of ["dev", "test"]) {
      const path = `.local/${kind}-password`;
      if (!existsSync(path)) writeFileSync(path, randomBytes(32).toString("hex"), { mode: 0o600, flag: "wx" });
    }
    const retained = existing.split(/\r?\n/).filter(line => !/^\s*(DATABASE_URL|TEST_DATABASE_URL)\s*=/.test(line)).join("\n");
    writeFileSync(".env", `${retained}\nDATABASE_URL="${urlFor("dev")}"\nTEST_DATABASE_URL="${urlFor("test")}"\n`, { mode: 0o600 });
    console.log("Credenciales aleatorias locales creadas en .local/ y .env (ignoradas por Git).");
  } else if (action === "up") {
    configuredUrl("dev"); compose("up", "-d", "--wait", "postgres");
    await verify(configuredUrl("dev"), "dev");
  } else if (action === "down") {
    compose("--profile", "test", "down"); // Deliberately no --volumes.
  } else if (action === "migrate") {
    const value = configuredUrl("dev"); await verify(value, "dev"); migrate(value);
  } else if (action === "test") {
    const value = configuredUrl("test");
    // Only recreate the dedicated tmpfs service, never the development volume.
    compose("--profile", "test", "up", "-d", "--wait", "--force-recreate", "postgres-test");
    try {
      await verify(value, "test"); migrate(value);
      run(process.execPath, [resolve("scripts/backup-restore-test.mjs")], { ...process.env, TEST_DATABASE_URL: value });
      run(process.execPath, [resolve("node_modules/tsx/dist/cli.mjs"), "--conditions=react-server", "--test", "--test-concurrency=1", "tests/domain.test.ts", "tests/local-db-safety.test.ts", "tests/calendar-feed.test.ts", "tests/csv.test.ts", "tests/postgres.test.ts", "tests/calendar-feed-postgres.test.ts", "tests/maintenance.test.ts", "tests/auth.test.ts"],
        { ...process.env, DATABASE_URL: configuredUrl("dev"), TEST_DATABASE_URL: value });
    } finally {
      compose("--profile", "test", "stop", "postgres-test");
      compose("--profile", "test", "rm", "-f", "postgres-test");
    }
  } else if (action === "e2e") {
    const value = configuredUrl("test");
    await runE2e(value);
  } else throw new Error("Usa setup, up, down, migrate, test o e2e.");
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
