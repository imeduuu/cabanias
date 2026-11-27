import { requireAdmin } from "@/lib/require-admin";
import { listAdminRequestsForCsv } from "@/lib/admin-data";
import { requestFilters } from "@/modules/bookings/admin-view";
import { buildRequestsCsv } from "@/modules/bookings/csv";
import { DomainError } from "@/modules/bookings/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await requireAdmin();
  let filters;
  try {
    const params = new URL(request.url).searchParams;
    filters = requestFilters(Object.fromEntries(["status", "from", "to"].map(key => {
      const values = params.getAll(key);
      return [key, values.length > 1 ? values : values[0]];
    })));
  } catch (error) {
    return new Response(error instanceof DomainError ? error.message : "Revisa los filtros.", { status: 400 });
  }
  const rows = await listAdminRequestsForCsv(filters);
  const csv = buildRequestsCsv(rows.map(row => ({ cabin: row.cabin.name, mode: row.mode, startsAt: row.startsAt, endsAt: row.endsAt,
    guests: row.guests, name: row.guestName, email: row.guestEmail, phone: row.guestPhone, status: row.status,
    totalClp: row.estimatedTotalClp, createdAt: row.createdAt })));
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="solicitudes.csv"',
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
