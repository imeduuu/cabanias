import { Temporal } from "@js-temporal/polyfill";

export const TIMEZONE = "America/Santiago";
export const CURRENCY = "CLP";
export type Mode = "NIGHTLY" | "HOURLY";
export type Status = "PENDING" | "CONFIRMED" | "REJECTED" | "CANCELLED";
export class DomainError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "DomainError";
  }
}
export function invariant(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new DomainError(code, message);
}
export function interval(startsAt: Date, endsAt: Date) {
  invariant(Number.isFinite(+startsAt) && Number.isFinite(+endsAt) && +startsAt < +endsAt,
    "INVALID_INTERVAL", "El inicio debe ser anterior a la salida.");
  return { startsAt, endsAt };
}
export function overlaps(a: { startsAt: Date; endsAt: Date }, b: { startsAt: Date; endsAt: Date }) {
  return a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}
export function assertTransition(from: Status, to: Status) {
  invariant((from === "PENDING" && ["CONFIRMED", "REJECTED", "CANCELLED"].includes(to)) ||
    (from === "CONFIRMED" && to === "CANCELLED"), "INVALID_STATUS", "Transición de estado no permitida.");
}
export type StayInput =
  | { mode: "NIGHTLY"; arrivalDate: string; departureDate: string }
  | { mode: "HOURLY"; startsAt: string; endsAt: string };
export type Season = { id: string; startDate: Date; endDate: Date; rateClp: number };
export function clp(value: number) {
  invariant(Number.isInteger(value) && value >= 0 && value <= 2147483647,
    "INVALID_PRICE", "El monto debe ser un entero CLP válido.");
  return value;
}
function dateOnly(value: string) {
  invariant(/^\d{4}-\d{2}-\d{2}$/.test(value), "INVALID_DATE", "Usa fechas YYYY-MM-DD.");
  return Temporal.PlainDate.from(value);
}
function atHour(date: Temporal.PlainDate, hour: number) {
  invariant(Number.isInteger(hour) && hour >= 0 && hour <= 23, "INVALID_HOUR", "Hora no válida.");
  return Temporal.ZonedDateTime.from({ timeZone: TIMEZONE, year: date.year, month: date.month,
    day: date.day, hour }, { disambiguation: "reject" });
}
function instant(value: string) {
  // Temporal.Instant requires Z or an explicit UTC offset; never interpret host-local time.
  return Temporal.Instant.from(value).toZonedDateTimeISO(TIMEZONE);
}
export function estimateStay(input: StayInput, cabin: { mode: Mode; baseRateClp: number },
  seasons: Season[], hours: { checkInHour: number; checkOutHour: number }) {
  invariant(input.mode === cabin.mode, "MODE_MISMATCH", "La modalidad no coincide con la cabaña.");
  clp(cabin.baseRateClp);
  for (const season of seasons) {
    clp(season.rateClp);
    invariant(+season.startDate < +season.endDate, "INVALID_SEASON", "Temporada no válida.");
  }
  const sorted = [...seasons].sort((a, b) => +a.startDate - +b.startDate);
  for (let i = 1; i < sorted.length; i++) {
    invariant(sorted[i - 1].endDate <= sorted[i].startDate, "SEASON_OVERLAP", "Las temporadas no pueden superponerse.");
  }
  const lines: { date: string; rateClp: number; seasonId: string | null; units: number }[] = [];
  function charge(date: string) {
    const season = seasons.find(s => s.startDate.toISOString().slice(0, 10) <= date && date < s.endDate.toISOString().slice(0, 10));
    lines.push({ date, rateClp: season?.rateClp ?? cabin.baseRateClp, seasonId: season?.id ?? null, units: 1 });
  }
  let start: Temporal.ZonedDateTime;
  let end: Temporal.ZonedDateTime;
  try {
    if (input.mode === "NIGHTLY") {
      const arrival = dateOnly(input.arrivalDate), departure = dateOnly(input.departureDate);
      const nights = arrival.until(departure).days;
      invariant(nights > 0 && nights <= 366, "INVALID_DURATION", "La estadía debe tener entre 1 y 366 noches.");
      start = atHour(arrival, hours.checkInHour);
      end = atHour(departure, hours.checkOutHour);
      for (let day = arrival; Temporal.PlainDate.compare(day, departure) < 0; day = day.add({ days: 1 })) charge(day.toString());
    } else {
      start = instant(input.startsAt); end = instant(input.endsAt);
      const duration = (end.epochMilliseconds - start.epochMilliseconds) / 3600000;
      invariant(duration > 0 && duration <= 24 * 366 && Number.isInteger(duration),
        "INVALID_DURATION", "El arriendo debe tener horas completas, hasta 366 días.");
      invariant([start, end].every(t => t.minute === 0 && t.second === 0 && t.millisecond === 0 && t.microsecond === 0 && t.nanosecond === 0),
        "INVALID_HOUR", "Los arriendos por hora deben comenzar y terminar en horas en punto.");
      // Add elapsed hours, not wall-clock hours: DST days may have 23 or 25 hours.
      for (let t = start; t.epochMilliseconds < end.epochMilliseconds; t = t.add({ hours: 1 })) charge(t.toPlainDate().toString());
    }
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError("INVALID_DATE", "Fecha inválida, ambigua o inexistente en America/Santiago.");
  }
  const range = interval(new Date(start.epochMilliseconds), new Date(end.epochMilliseconds));
  const totalClp = clp(lines.reduce((total, line) => total + line.rateClp, 0));
  return { ...range, totalClp, snapshot: { version: 1, timezone: TIMEZONE, currency: CURRENCY,
    mode: input.mode, checkInHour: hours.checkInHour, checkOutHour: hours.checkOutHour, lines } };
}

export function validateGuest(input: { guestName: string; guestEmail: string; guestPhone?: string; guests: number }, capacity: number) {
  const guestName = input.guestName.trim();
  const guestEmail = input.guestEmail.trim().toLowerCase();
  const guestPhone = input.guestPhone?.trim() || null;
  invariant(guestName.length > 0 && guestName.length <= 120, "INVALID_GUEST", "Nombre no válido.");
  invariant(guestEmail.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail), "INVALID_GUEST", "Correo no válido.");
  invariant(!guestPhone || guestPhone.length <= 40, "INVALID_GUEST", "Teléfono no válido.");
  invariant(Number.isInteger(input.guests) && input.guests > 0 && input.guests <= capacity,
    "CAPACITY_EXCEEDED", "La cantidad de personas supera la capacidad o no es válida.");
  return { guestName, guestEmail, guestPhone, guests: input.guests };
}
