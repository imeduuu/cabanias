import "dotenv/config";
import { input, password } from "@inquirer/prompts";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { createInitialAdministrator } from "../src/modules/auth/core";
import { assertLocalUrl, assertProductionUrl } from "./local-db-safety.mjs";

async function main() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("Usa una terminal interactiva. No se aceptan contraseñas por argumentos, archivos o pipes.");
  if (process.env.NODE_ENV === "production") assertProductionUrl(process.env.DATABASE_URL);
  else assertLocalUrl(process.env.DATABASE_URL, "dev");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    if (await db.administrator.count()) throw new Error("Ya existe la cuenta administradora; no se reemplazó.");
    const email = await input({ message: "Correo de la cuenta administradora:", validate: value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) || "Ingresa un correo válido." });
    const name = await input({ message: "Nombre:", validate: value => !!value.trim() || "Ingresa un nombre." });
    const value = await password({ message: "Contraseña (12–128 caracteres):", mask: "*",
      validate: value => (value.length >= 12 && value.length <= 128) || "Usa entre 12 y 128 caracteres." });
    const confirmation = await password({ message: "Repite la contraseña:", mask: "*" });
    if (value !== confirmation) throw new Error("Las contraseñas no coinciden.");
    await createInitialAdministrator(db, { email, name, password: value });
    console.log("Cuenta inicial creada. Puedes iniciar sesión en /login.");
  } finally { await db.$disconnect(); }
}
main().catch(() => { console.error("No se creó la cuenta. Revisa la configuración, las migraciones y que no exista otra cuenta; usa una terminal interactiva."); process.exitCode = 1; });
