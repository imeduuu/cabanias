import "server-only";
import type { PrismaClient } from "../../generated/prisma/client";
import { invariant } from "../bookings/domain";
import { buildCalendar } from "./ical";
import { hashFeedToken, newFeedToken, parseFeedFile } from "./token";

const DAY = 86_400_000;
const PAST_DAYS = 90, FUTURE_DAYS = 730, MAX_EVENTS = 5000;
const COMMON_HEADERS = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow" };

export function notFoundResponse() {
  return new Response("No encontrado", { status: 404, headers: { ...COMMON_HEADERS, "Content-Type": "text/plain; charset=utf-8" } });
}
function unavailableResponse() {
  return new Response("Servicio no disponible", { status: 503, headers: { ...COMMON_HEADERS, "Content-Type": "text/plain; charset=utf-8" } });
}
export async function issueCalendarFeed(db: PrismaClient, cabinId: string, now = new Date()) {
  const cabin = await db.cabin.findUnique({ where: { id: cabinId }, select: { id: true } });
  invariant(cabin, "NOT_FOUND", "La cabaña ya no existe.");
  const token = newFeedToken(), tokenHash = hashFeedToken(token);
  await db.cabinCalendarFeed.upsert({ where: { cabinId }, create: { cabinId, tokenHash, createdAt: now, rotatedAt: now }, update: { tokenHash, rotatedAt: now } });
  return { token, rotatedAt: now };
}
export async function calendarFeedResponse(db: PrismaClient, file: string, now = new Date()): Promise<Response> {
  const token = parseFeedFile(file);
  if (!token) return notFoundResponse();
  try {
    const feed = await db.cabinCalendarFeed.findUnique({ where: { tokenHash: hashFeedToken(token) },
      select: { cabin: { select: { id: true, name: true } } } });
    if (!feed) return notFoundResponse();
    // Occupancy only holds CONFIRMED bookings and blocks; selecting three columns keeps guest data out by construction.
    const events = await db.occupancy.findMany({
      where: { cabinId: feed.cabin.id, endsAt: { gt: new Date(+now - PAST_DAYS * DAY) }, startsAt: { lt: new Date(+now + FUTURE_DAYS * DAY) } },
      orderBy: [{ startsAt: "asc" }, { id: "asc" }], take: MAX_EVENTS, select: { id: true, startsAt: true, endsAt: true } });
    const body = buildCalendar(`Ocupación · ${feed.cabin.name}`, events.map(e => ({ uid: e.id, startsAt: e.startsAt, endsAt: e.endsAt })), now);
    return new Response(body, { status: 200, headers: { ...COMMON_HEADERS, "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="ocupacion.ics"' } });
  } catch { return unavailableResponse(); }
}
