import { createHash, randomBytes } from "node:crypto";
export function newFeedToken() { return randomBytes(32).toString("base64url"); }
// High-entropy bearer token: a plain salted SHA-256 is enough and does not depend on the auth secret.
export function hashFeedToken(token: string) {
  return createHash("sha256").update(`calendar-feed-v1:${token}`).digest("hex");
}
export function parseFeedFile(file: string): string | null {
  return /^([A-Za-z0-9_-]{43})\.ics$/.exec(file)?.[1] ?? null;
}
