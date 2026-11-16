"use server";
import { headers } from "next/headers";
import { getDb } from "@/lib/db";
import { createIdempotentRequest, quoteRequest } from "@/modules/bookings/service";
import { randomUUID } from "node:crypto";
import { visitorKey } from "@/modules/bookings/visitor";
import { submissionDigests } from "@/modules/bookings/submission-key";
import { field, publicStayInput } from "@/modules/bookings/public-input";
import { DomainError, invariant } from "@/modules/bookings/domain";
import { limitPublicBooking } from "@/modules/bookings/public-limit";
import { issueQuote, quoteFingerprint, readQuote } from "@/modules/bookings/quote-security";
import type { PublicBookingState } from "@/modules/bookings/public-types";

export async function publicBookingAction(_state: PublicBookingState, form: FormData): Promise<PublicBookingState> {
  try {
    const origin = (await headers()).get("origin");
    invariant(!!process.env.BETTER_AUTH_URL && origin === new URL(process.env.BETTER_AUTH_URL).origin,
      "INVALID_ORIGIN", "Recarga la página desde el sitio del negocio antes de intentar nuevamente.");
    const intent = field(form, "intent", 10);
    invariant(intent === "quote" || intent === "request", "INVALID_FORM", "Selecciona una operación válida.");
    const db = getDb();
    const visitor = await visitorKey();
    if (intent === "quote") await limitPublicBooking(db, "quote", visitor);
    invariant(!field(form, "website", 200, true), "INVALID_FORM", "No se pudo procesar el formulario.");
    const slug = field(form, "slug", 100);
    if (intent === "quote") {
      const cabin = await db.cabin.findFirst({ where: { slug, publicationStatus: "PUBLISHED" }, select: { id: true } });
      invariant(cabin, "CABIN_UNPUBLISHED", "Esta cabaña no está disponible para solicitudes.");
      const input = { cabinId: cabin.id, ...publicStayInput(form) };
      const quote = await quoteRequest(db, input);
      const lines: { date: string; rateClp: number; units: number }[] = [];
      for (const line of quote.snapshot.lines) {
        const previous = lines.at(-1);
        if (previous && previous.date === line.date && previous.rateClp === line.rateClp) previous.units++;
        else lines.push({ date: line.date, rateClp: line.rateClp, units: 1 });
      }
      const selection = Object.fromEntries(["arrivalDate", "departureDate", "date", "hour", "duration", "guests"].map(key => [key, field(form, key, 10, true)]));
      return { selection, quote: { token: issueQuote(quoteFingerprint(cabin.id, input.guests, quote)), totalClp: quote.totalClp,
        startsAt: quote.startsAt.toISOString(), endsAt: quote.endsAt.toISOString(), lines } };
    }
    const mode = field(form, "mode", 10);
    const content = { slug, mode, guests: field(form, "guests", 10),
      ...(mode === "NIGHTLY" ? { arrivalDate: field(form,"arrivalDate",10), departureDate: field(form,"departureDate",10) }
        : { date: field(form,"date",10), hour: field(form,"hour",10), duration: field(form,"duration",10) }),
      guestName: field(form,"guestName",120), guestEmail: field(form,"guestEmail",254).toLowerCase(), guestPhone: field(form,"guestPhone",40,true),
      acknowledgement: field(form,"acknowledgement",3,true) };
    const {keyHash,payloadHash} = submissionDigests(field(form,"submissionKey",36),content);
    await createIdempotentRequest(db,keyHash,payloadHash,visitor,async tx => {
      const expectedFingerprint = readQuote(field(form, "quoteToken", 1024));
      invariant(content.acknowledgement === "yes", "ACKNOWLEDGEMENT", "Debes aceptar que el envío es solo una solicitud pendiente de aprobación.");
      const cabin = await tx.cabin.findFirst({ where: { slug, publicationStatus: "PUBLISHED" }, select: { id: true } });
      invariant(cabin, "CABIN_UNPUBLISHED", "Esta cabaña no está disponible para solicitudes.");
      return { cabinId: cabin.id, ...publicStayInput(form), expectedFingerprint,
        guestName: content.guestName, guestEmail: content.guestEmail, guestPhone: content.guestPhone || undefined };
    });
    // Never return a booking row, guest information, internal ID or private calendar.
    return { success: true, nextSubmissionKey: randomUUID() };
  } catch (error) {
    if (error instanceof DomainError && !["SETTINGS_MISSING", "CABIN_NOT_FOUND"].includes(error.code)) return { error: error.message };
    return { error: "No se pudo completar la operación. Intenta nuevamente más tarde." };
  }
}
