import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
export const visitorCookieName = "cabanias.visitor";
export function privateHash(purpose: string, value: string) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("Missing server secret");
  return createHmac("sha256", secret).update(`${purpose}:${value}`).digest("hex");
}
export async function visitorKey() {
  const store = await cookies();
  const existing = store.get(visitorCookieName)?.value;
  let identity: string | undefined;
  if (existing && existing.length < 250) {
    const [payload, signature] = existing.split(".");
    if (/^[a-f0-9-]{36}:\d{13}$/.test(payload ?? "") && /^[a-f0-9]{64}$/.test(signature ?? "")) {
      const expected = Buffer.from(privateHash("visitor-cookie-v1", payload));
      if (timingSafeEqual(expected, Buffer.from(signature)) && Number(payload.split(":")[1]) > Date.now()) identity = payload;
    }
  }
  if (!identity) {
    identity = `${randomUUID()}:${Date.now() + 30 * 86400000}`;
    const secure = new URL(process.env.BETTER_AUTH_URL!).protocol === "https:";
    store.set(visitorCookieName, `${identity}.${privateHash("visitor-cookie-v1", identity)}`, {
      httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 30 * 86400,
    });
  }
  return privateHash("visitor-limit-v1", identity);
}
