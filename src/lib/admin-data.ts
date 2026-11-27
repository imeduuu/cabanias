import "server-only";
import { getDb } from "./db";
import { requireAdmin } from "./require-admin";
import type { RequestFilters } from "@/modules/bookings/admin-view";
import type { Prisma } from "../generated/prisma/client";
import { csvRequestWhere } from "@/modules/bookings/csv";

export async function listAdminRequests(filters: RequestFilters) {
  await requireAdmin();
  const where: Prisma.BookingRequestWhereInput = { ...(filters.status ? { status: filters.status } : {}),
    ...(filters.from ? { endsAt: { gt: filters.from } } : {}), ...(filters.until ? { startsAt: { lt: filters.until } } : {}) };
  const [requests, total] = await getDb().$transaction([
    getDb().bookingRequest.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (filters.page - 1) * 20, take: 20,
      select: { id: true, status: true, mode: true, startsAt: true, endsAt: true, guests: true, guestName: true, estimatedTotalClp: true,
        cabin: { select: { name: true } } } }),
    getDb().bookingRequest.count({ where }),
  ]);
  return { requests, total };
}
export async function listAdminRequestsForCsv(filters: RequestFilters) {
  await requireAdmin();
  return getDb().bookingRequest.findMany({ where: csvRequestWhere(filters), orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { mode: true, startsAt: true, endsAt: true, guests: true, guestName: true, guestEmail: true, guestPhone: true,
      status: true, estimatedTotalClp: true, createdAt: true, cabin: { select: { name: true } } } });
}
export async function getAdminRequest(id: string) {
  await requireAdmin();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  return getDb().bookingRequest.findUnique({ where: { id }, include: { cabin: { select: { name: true, slug: true } } } });
}
export async function getAdminRequestCounts() {
  await requireAdmin();
  const groups = await getDb().bookingRequest.groupBy({ by: ["status"], _count: { _all: true } });
  return { pending: groups.find(g => g.status === "PENDING")?._count._all ?? 0,
    confirmed: groups.find(g => g.status === "CONFIRMED")?._count._all ?? 0 };
}
export async function listAdminCabins() {
  await requireAdmin();
  return getDb().cabin.findMany({ orderBy: { createdAt: "asc" }, include: { images: { orderBy: { position: "asc" } }, seasonalRates: { orderBy: { startDate: "asc" } } } });
}
export async function getAdminCabin(id: string) {
  await requireAdmin();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  return getDb().cabin.findUnique({ where: { id }, include: { images: { orderBy: { position: "asc" } }, amenities: { include: { amenity: true } }, seasonalRates: { orderBy: { startDate: "asc" } } } });
}
export async function getCalendarFeedStatus(cabinId: string) {
  await requireAdmin();
  // Never select tokenHash: the page only needs to know whether a link exists and since when.
  return getDb().cabinCalendarFeed.findUnique({ where: { cabinId }, select: { createdAt: true, rotatedAt: true } });
}
export async function getAdminSettings() {
  await requireAdmin();
  return getDb().businessSettings.findUnique({ where: { id: 1 } });
}
