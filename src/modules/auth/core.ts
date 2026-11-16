import { betterAuth } from "better-auth";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { nextCookies } from "better-auth/next-js";
import type { PrismaClient } from "../../generated/prisma/client";

function createAuth(db: PrismaClient, bootstrap = false) {
  const secret = process.env.BETTER_AUTH_SECRET;
  const baseURL = process.env.BETTER_AUTH_URL;
  if (!secret || secret.length < 32 || !baseURL) throw new Error("Configura BETTER_AUTH_SECRET y BETTER_AUTH_URL antes de usar autenticación.");
  const url = new URL(baseURL);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new Error("Autenticación requiere HTTPS fuera de loopback.");
  }
  return betterAuth({
    appName: "Administración de cabañas",
    baseURL: url.origin,
    secret,
    trustedOrigins: [url.origin],
    database: prismaAdapter(db, { provider: "postgresql", transaction: true }),
    user: { modelName: "administrator", additionalFields: { active: { type: "boolean", defaultValue: true, input: false } } },
    emailAndPassword: { enabled: true, disableSignUp: !bootstrap, autoSignIn: false, minPasswordLength: 12, maxPasswordLength: 128 },
    session: { expiresIn: 8 * 60 * 60, updateAge: 30 * 60, cookieCache: { enabled: false } },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 60,
      customRules: { "/sign-in/email": { window: 60, max: 5 } } },
    advanced: { database: { generateId: "uuid" }, useSecureCookies: url.protocol === "https:",
      ipAddress: { ipAddressHeaders: ["x-cabanias-auth-bucket"] },
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", path: "/" } },
    logger: { disabled: true },
    plugins: bootstrap ? [] : [nextCookies()],
  });
}

export function createRuntimeAuth(db: PrismaClient) { return createAuth(db); }

// CLI only: never mount this instance as an HTTP handler.
export async function createInitialAdministrator(db: PrismaClient, input: { email: string; name: string; password: string }) {
  if (await db.administrator.count()) throw new Error("Ya existe la cuenta administradora. No se reemplazó.");
  return createAuth(db, true).api.signUpEmail({ body: { email: input.email.trim().toLowerCase(), name: input.name.trim(), password: input.password } });
}
