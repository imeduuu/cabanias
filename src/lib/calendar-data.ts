import "server-only";
import { requireAdmin } from "./require-admin";
import { getDb } from "./db";
import { calendarWindow } from "@/modules/bookings/calendar";
import { invariant } from "@/modules/bookings/domain";
export async function calendarCabins() {
  await requireAdmin();
  return getDb().cabin.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, mode: true, publicationStatus: true } });
}
export async function calendarEntries(cabinId: string, date?: string) {
  await requireAdmin();
  invariant(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cabinId), "INVALID_CABIN", "Selecciona una cabaña válida.");
  const cabin = await getDb().cabin.findUnique({ where: { id: cabinId }, select: { id: true, name: true, mode: true } });
  invariant(cabin, "INVALID_CABIN", "La cabaña ya no existe.");
  const window = calendarWindow(cabin.mode, date);
  const where = { cabinId, startsAt: { lt: window.endsAt }, endsAt: { gt: window.startsAt } };
  const [requests, blocks] = await getDb().$transaction([
    getDb().bookingRequest.findMany({ where: { ...where, status: { in: ["CONFIRMED", "PENDING"] } }, orderBy: [{ startsAt: "asc" }, { id: "asc" }], take: 501,
      select: { id: true, startsAt: true, endsAt: true, status: true } }),
    getDb().manualBlock.findMany({ where, orderBy: [{ startsAt: "asc" }, { id: "asc" }], take: 501, select: { id: true, startsAt: true, endsAt: true, reason: true } }),
  ]);
  const entries = [...requests.slice(0,500).map(row => ({ ...row, kind: row.status as "CONFIRMED" | "PENDING", reason: "" })),
    ...blocks.slice(0,500).map(row => ({ ...row, kind: "BLOCK" as const }))].sort((a,b) => +a.startsAt - +b.startsAt);
  return { cabin, window, entries, truncated: requests.length > 500 || blocks.length > 500 };
}
