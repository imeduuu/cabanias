import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { parse } from "dotenv";
if (process.env.CI === "true") {
  if (!process.env.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET.length < 32) {
    throw new Error("En CI se requiere un BETTER_AUTH_SECRET efímero de al menos 32 caracteres.");
  }
  process.env.BETTER_AUTH_URL ||= "http://localhost:3000";
  console.log("Configuración efímera de autenticación para CI validada; no se escribió ningún archivo.");
  process.exit(0);
}
const contents = readFileSync(".env", "utf8");
const config = parse(contents);
let next = contents;
for (const [key, value] of Object.entries({ BETTER_AUTH_SECRET: randomBytes(48).toString("hex"), BETTER_AUTH_URL: "http://localhost:3000" })) {
  if (!config[key]) {
    next = next.replace(new RegExp(`^${key}=.*$`, "gm"), "");
    next += `\n${key}="${value}"\n`;
  }
}
writeFileSync(".env", next, { mode: 0o600 });
console.log("Configuración local de autenticación preparada en .env; secretos conservados y no mostrados.");
