import { requestStatuses, type RequestFilters } from "./admin-view";

export function escapeCsvValue(value: string | number) {
  let text = String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function buildRequestsCsv(rows: {
  cabin: string; mode: string; startsAt: Date; endsAt: Date; guests: number; name: string; email: string;
  phone: string | null; status: string; totalClp: number; createdAt: Date;
}[]) {
  const localDateTime = (value: Date) => new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(value).replace(" ", "T");
  const headers = ["Cabaña", "Modalidad", "Inicio", "Salida", "Huéspedes", "Nombre", "Correo", "Teléfono", "Estado", "Total CLP", "Fecha de envío"];
  const records = rows.map(row => [row.cabin, row.mode === "NIGHTLY" ? "Por noche" : "Por hora", localDateTime(row.startsAt), localDateTime(row.endsAt),
    row.guests, row.name, row.email, row.phone ?? "", requestStatuses[row.status as keyof typeof requestStatuses] ?? row.status, row.totalClp, localDateTime(row.createdAt)]);
  return `\uFEFF${[headers, ...records].map(record => record.map(escapeCsvValue).join(",")).join("\r\n")}\r\n`;
}

export function csvRequestWhere(filters: RequestFilters) {
  return { ...(filters.status ? { status: filters.status } : {}),
    ...(filters.from ? { endsAt: { gt: filters.from } } : {}), ...(filters.until ? { startsAt: { lt: filters.until } } : {}) };
}
