import { mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { basename, resolve } from "node:path";

const value = process.env.BACKUP_DATABASE_URL;
const destination = process.argv[2];
if (!value || !destination) throw new Error("Uso: BACKUP_DATABASE_URL=<URL> npm run db:backup -- <directorio>");
const url = new URL(value);
if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || !url.pathname.slice(1)) {
  throw new Error("BACKUP_DATABASE_URL debe ser una URL PostgreSQL explícita.");
}
const database = decodeURIComponent(url.pathname.slice(1));
url.searchParams.delete("schema");
const connectionEnv = { ...process.env, PGPASSWORD: decodeURIComponent(url.password) };
for (const [key, value] of url.searchParams) {
  const variable = ({ sslmode: "PGSSLMODE", channel_binding: "PGCHANNELBINDING", application_name: "PGAPPNAME", connect_timeout: "PGCONNECT_TIMEOUT" })[key];
  if (!variable) throw new Error(`Parámetro PostgreSQL no admitido en BACKUP_DATABASE_URL: ${key}`);
  connectionEnv[variable] = value;
}
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const directory = resolve(destination);
mkdirSync(directory, { recursive: true });
const file = resolve(directory, `${database}_${stamp}.dump`);
const result = spawnSync("pg_dump", ["--format=custom", "--no-owner", "--no-acl", "--file", file, "--host", url.hostname, "--port", url.port || "5432", "--username", decodeURIComponent(url.username), "--dbname", database], { stdio: "inherit", shell: false, env: connectionEnv });
if (result.error || result.status !== 0) throw new Error(`pg_dump falló${result.error ? `: ${result.error.message}` : "."}`);
console.log(`Respaldo creado: ${basename(file)}`);
