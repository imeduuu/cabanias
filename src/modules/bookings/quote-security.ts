import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { DomainError } from "./domain";

export function quoteFingerprint(cabinId: string, guests: number, quote: {
  startsAt: Date; endsAt: Date; totalClp: number; snapshot: unknown;
}) {
  return createHash("sha256").update(JSON.stringify([cabinId, guests, quote.startsAt.toISOString(), quote.endsAt.toISOString(), quote.totalClp, quote.snapshot])).digest("hex");
}
function sign(value: string) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("Missing server secret");
  return createHmac("sha256", secret).update(`booking-quote-v1:${value}`).digest();
}
export function issueQuote(fingerprint: string) {
  const payload = Buffer.from(JSON.stringify({ fingerprint, expires: Date.now() + 5 * 60000 })).toString("base64url");
  return `${payload}.${sign(payload).toString("base64url")}`;
}
export function readQuote(token: string) {
  try {
    if (token.length > 1024) throw new Error();
    const [payload, signature, extra] = token.split(".");
    if (!payload || !signature || extra) throw new Error();
    const expected = sign(payload), received = Buffer.from(signature, "base64url");
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) throw new Error();
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!/^[a-f0-9]{64}$/.test(value.fingerprint) || !Number.isFinite(value.expires) || value.expires <= Date.now()) throw new Error();
    return value.fingerprint as string;
  } catch { throw new DomainError("QUOTE_EXPIRED", "Consulta nuevamente el precio y la disponibilidad antes de enviar."); }
}
