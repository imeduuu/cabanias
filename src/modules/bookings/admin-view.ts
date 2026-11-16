import { Temporal } from "@js-temporal/polyfill";
import { DomainError, TIMEZONE } from "./domain";
export const requestStatuses = { PENDING: "Pendiente", CONFIRMED: "Confirmada", REJECTED: "Rechazada", CANCELLED: "Cancelada" } as const;
export type RequestStatus = keyof typeof requestStatuses;
export type RequestFilters = { status?: RequestStatus; from?: Date; until?: Date; fromText: string; toText: string; page: number };
export function requestFilters(query: Record<string, string | string[] | undefined>): RequestFilters {
  function value(key: string) {
    const item = query[key];
    if (Array.isArray(item)) throw new DomainError("INVALID_FILTER", "Usa un solo valor para cada filtro.");
    return item ?? "";
  }
  const status = value("status"), fromText = value("from"), toText = value("to"), pageText = value("page") || "1";
  if (status && !Object.hasOwn(requestStatuses, status)) throw new DomainError("INVALID_FILTER", "Selecciona un estado válido.");
  if (!/^\d{1,5}$/.test(pageText) || +pageText < 1 || +pageText > 10000) throw new DomainError("INVALID_FILTER", "Número de página no válido.");
  try {
    function date(text: string) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error();
      return Temporal.PlainDate.from(text);
    }
    const start = fromText ? date(fromText) : undefined, end = toText ? date(toText) : undefined;
    if (start && end && Temporal.PlainDate.compare(start, end) > 0) throw new Error();
    return { status: status ? status as RequestStatus : undefined, fromText, toText, page: +pageText,
      from: start ? new Date(start.toZonedDateTime(TIMEZONE).epochMilliseconds) : undefined,
      until: end ? new Date(end.add({ days: 1 }).toZonedDateTime(TIMEZONE).epochMilliseconds) : undefined };
  } catch { throw new DomainError("INVALID_FILTER", "Revisa las fechas: usa fechas válidas y un fin igual o posterior al inicio."); }
}
export function localPeriod(value: Date) {
  return new Intl.DateTimeFormat("es-CL", { timeZone: TIMEZONE, dateStyle: "medium", timeStyle: "short" }).format(value);
}
export function storedBreakdown(value: unknown) {
  if (!value || typeof value !== "object" || !("lines" in value) || !Array.isArray(value.lines)) return null;
  const result: { date: string; rateClp: number; units: number; seasonal: boolean }[] = [];
  for (const line of value.lines) {
    if (!line || typeof line !== "object" || typeof line.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(line.date) ||
      !Number.isInteger(line.rateClp) || line.rateClp < 0 || !Number.isInteger(line.units) || line.units < 1) return null;
    const previous = result.at(-1), seasonal = !!line.seasonId;
    if (previous && previous.date === line.date && previous.rateClp === line.rateClp && previous.seasonal === seasonal) previous.units += line.units;
    else result.push({ date: line.date, rateClp: line.rateClp, units: line.units, seasonal });
  }
  return result;
}
