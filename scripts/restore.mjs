import { spawnSync } from "node:child_process";
import { basename, resolve } from "node:path";

const archive = process.argv[2];
const targetValue = process.env.RESTORE_TARGET_URL;
const confirmation = process.env.RESTORE_CONFIRMATION;
if (!archive || !targetValue) throw new Error("Uso: RESTORE_TARGET_URL=<URL> RESTORE_CONFIRMATION=<frase> npm run db:restore -- <respaldo.dump>");
let target;
try { target = new URL(targetValue); } catch { throw new Error("RESTORE_TARGET_URL debe ser una URL PostgreSQL válida."); }
if (!["postgres:", "postgresql:"].includes(target.protocol) || !target.hostname || !target.username || !target.password) {
  throw new Error("RESTORE_TARGET_URL debe identificar explícitamente servidor, usuario y base PostgreSQL.");
}
const database = decodeURIComponent(target.pathname.slice(1));
target.searchParams.delete("schema");
if (!database || ["template0", "template1"].includes(database)) throw new Error("Base de destino no válida.");
if (confirmation !== `RESTAURAR ${database}`) throw new Error(`Confirma escribiendo exactamente: RESTAURAR ${database}`);
const connectionEnv = { ...process.env, PGPASSWORD: decodeURIComponent(target.password) };
for (const [key, value] of target.searchParams) {
  const variable = ({ sslmode: "PGSSLMODE", channel_binding: "PGCHANNELBINDING", application_name: "PGAPPNAME", connect_timeout: "PGCONNECT_TIMEOUT" })[key];
  if (!variable) throw new Error(`Parámetro PostgreSQL no admitido en RESTORE_TARGET_URL: ${key}`);
  connectionEnv[variable] = value;
}
const result = spawnSync("pg_restore", ["--clean", "--if-exists", "--no-owner", "--no-acl", "--host", target.hostname, "--port", target.port || "5432", "--username", decodeURIComponent(target.username), "--dbname", database, resolve(archive)], { stdio: "inherit", shell: false, env: connectionEnv });
if (result.error || result.status !== 0) throw new Error(`pg_restore falló${result.error ? `: ${result.error.message}` : "."}`);
console.log(`Restaurado ${basename(archive)} en la base explícita ${database}.`);
