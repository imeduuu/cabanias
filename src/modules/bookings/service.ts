import "server-only";
import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { assertTransition, DomainError, estimateStay, interval, invariant, validateGuest, type StayInput, type Status } from "./domain";
import { quoteFingerprint } from "./quote-security";
import { limitPublicBooking } from "./public-limit";

// Server-side services; callers must validate their own public/admin boundary.
type Tx = Prisma.TransactionClient;
async function lockCabin(tx: Tx, cabinId: string) {
  await tx.$queryRaw`SELECT id FROM "Cabin" WHERE id = ${cabinId}::uuid FOR UPDATE`;
  const cabin = await tx.cabin.findUnique({ where: { id: cabinId }, include: { seasonalRates: true } });
  invariant(cabin, "CABIN_NOT_FOUND", "Cabaña no encontrada.");
  return cabin;
}
async function assertFree(tx: Tx, cabinId: string, startsAt: Date, endsAt: Date) {
  interval(startsAt, endsAt);
  const occupied = await tx.occupancy.findFirst({ where: { cabinId, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } }, select: { id: true } });
  invariant(!occupied, "UNAVAILABLE", "El período ya está ocupado.");
}
async function transaction<T>(db: PrismaClient, operation: (tx: Tx) => Promise<T>) {
  try {
    // At ReadCommitted each check after acquiring the cabin lock sees the latest commit.
    return await db.$transaction(operation, { isolationLevel: "ReadCommitted", timeout: 15000 });
  } catch (error) {
    // PostgreSQL exclusion remains authoritative even for writes outside these services.
    if (error instanceof Error && (error.message.includes("occupancy_no_overlap") || error.message.includes("23P01"))) {
      throw new DomainError("UNAVAILABLE", "El período ya está ocupado.");
    }
    throw error;
  }
}
export type RequestInput = { cabinId: string; stay: StayInput;
  guestName: string; guestEmail: string; guestPhone?: string; guests: number; expectedFingerprint?: string };
async function persistRequest(tx: Tx, input: RequestInput) {
    const cabin = await lockCabin(tx, input.cabinId);
    invariant(cabin.publicationStatus === "PUBLISHED", "CABIN_UNPUBLISHED", "La cabaña no está publicada.");
    const settings = await tx.businessSettings.findUnique({ where: { id: 1 } });
    invariant(settings, "SETTINGS_MISSING", "Primero configura el negocio.");
    const guest = validateGuest(input, cabin.capacity);
    const quote = estimateStay(input.stay, cabin, cabin.seasonalRates, settings);
    invariant(quote.startsAt > new Date(), "PAST_START", "El inicio debe ser futuro.");
    await assertFree(tx, cabin.id, quote.startsAt, quote.endsAt);
    invariant(!input.expectedFingerprint || input.expectedFingerprint === quoteFingerprint(cabin.id, input.guests, quote),
      "QUOTE_CHANGED", "El precio o los datos cambiaron. Consulta nuevamente antes de enviar.");
    return tx.bookingRequest.create({ data: { cabinId: cabin.id, mode: cabin.mode, ...guest,
      startsAt: quote.startsAt, endsAt: quote.endsAt, estimatedTotalClp: quote.totalClp,
      pricingSnapshot: quote.snapshot, status: "PENDING" } });
}
export function createRequest(db: PrismaClient, input: RequestInput) {
  return transaction(db, tx => persistRequest(tx, input));
}
export async function createIdempotentRequest(db: PrismaClient, keyHash: string, payloadHash: string, visitor: string,
  prepare: (tx: Tx) => Promise<RequestInput>) {
  const result = await transaction(db, async tx => {
    // Same key is serialized before reading its ledger, even across processes/visitors.
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${keyHash}, 0))`;
    const existing = await tx.bookingSubmission.findUnique({ where: { keyHash } });
    if (existing) {
      invariant(existing.payloadHash === payloadHash, "KEY_REUSED", "No se puede reutilizar este envío con datos distintos. Inicia una solicitud nueva.");
      return { error: null };
    }
    try {
      await limitPublicBooking(tx, "request", visitor);
      const input = await prepare(tx);
      const request = await persistRequest(tx, input);
      await tx.bookingSubmission.create({ data: { keyHash, payloadHash, requestId: request.id } });
      return { error: null };
    } catch (error) {
      // Domain validation occurs before the insert. Commit the attempt counter even on rejection.
      if (error instanceof DomainError) return { error };
      throw error; // SQL errors roll back both request and ledger.
    }
  });
  if (result.error) throw result.error;
}
export function quoteRequest(db: PrismaClient, input: { cabinId: string; stay: StayInput; guests: number }) {
  return transaction(db, async tx => {
    const cabin = await lockCabin(tx, input.cabinId);
    invariant(cabin.publicationStatus === "PUBLISHED", "CABIN_UNPUBLISHED", "Esta cabaña no está disponible para solicitudes.");
    invariant(Number.isInteger(input.guests) && input.guests > 0 && input.guests <= cabin.capacity,
      "CAPACITY_EXCEEDED", "La cantidad de personas supera la capacidad o no es válida.");
    const settings = await tx.businessSettings.findUnique({ where: { id: 1 } });
    invariant(settings, "SETTINGS_MISSING", "No se puede consultar en este momento.");
    const quote = estimateStay(input.stay, cabin, cabin.seasonalRates, settings);
    invariant(quote.startsAt > new Date(), "PAST_START", "El inicio debe ser futuro.");
    await assertFree(tx, cabin.id, quote.startsAt, quote.endsAt);
    return quote;
  });
}
export function changeRequestStatus(db: PrismaClient, requestId: string, status: Exclude<Status, "PENDING">) {
  return transaction(db, async tx => {
    const reference = await tx.bookingRequest.findUnique({ where: { id: requestId }, select: { cabinId: true } });
    invariant(reference, "REQUEST_NOT_FOUND", "Solicitud no encontrada.");
    const cabin = await lockCabin(tx, reference.cabinId);
    // Read again after the lock; another confirmation may have committed while waiting.
    const request = await tx.bookingRequest.findUniqueOrThrow({ where: { id: requestId } });
    assertTransition(request.status, status);
    if (status === "CONFIRMED") {
      invariant(cabin.publicationStatus === "PUBLISHED", "CABIN_UNPUBLISHED", "La cabaña no está publicada.");
      invariant(request.mode === cabin.mode && request.guests <= cabin.capacity, "CABIN_CHANGED", "Revisa la modalidad y capacidad.");
      invariant(request.startsAt > new Date(), "PAST_START", "La solicitud ya comenzó.");
      await assertFree(tx, cabin.id, request.startsAt, request.endsAt);
    }
    // Trigger inserts occupation atomically. Failure rolls back status and occupation.
    return tx.bookingRequest.update({ where: { id: requestId }, data: { status } });
  });
}
export function createManualBlock(db: PrismaClient, input: { cabinId: string; startsAt: Date; endsAt: Date; reason: string }) {
  interval(input.startsAt, input.endsAt);
  invariant(input.reason.trim().length > 0 && input.reason.trim().length <= 500, "INVALID_REASON", "Indica el motivo del bloqueo.");
  return transaction(db, async tx => {
    await lockCabin(tx, input.cabinId);
    await assertFree(tx, input.cabinId, input.startsAt, input.endsAt);
    return tx.manualBlock.create({ data: { ...input, reason: input.reason.trim() } });
  });
}
export function removeManualBlock(db: PrismaClient, blockId: string) {
  return transaction(db, async tx => {
    const block = await tx.manualBlock.findUnique({ where: { id: blockId } });
    invariant(block, "BLOCK_NOT_FOUND", "Bloqueo no encontrado.");
    await lockCabin(tx, block.cabinId);
    return tx.manualBlock.delete({ where: { id: blockId } });
  });
}
