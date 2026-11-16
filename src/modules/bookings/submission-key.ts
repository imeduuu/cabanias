import "server-only";
import { createHash, createHmac } from "node:crypto";
import { invariant } from "./domain";
export function submissionDigests(key: string, payload: unknown) {
  invariant(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key), "INVALID_KEY", "Recarga el formulario para iniciar un envío nuevo.");
  const normalized = key.toLowerCase();
  // Random bearer key is not stored; keyed content digest resists offline guest-data guessing.
  // Independent of auth-secret rotation; ledger keys remain stable.
  return { keyHash: createHash("sha256").update(`booking-key-v1:${normalized}`).digest("hex"),
    payloadHash: createHmac("sha256", normalized).update(`booking-payload-v1:${JSON.stringify(payload)}`).digest("hex") };
}
