import { Temporal } from "@js-temporal/polyfill";
import { DomainError, TIMEZONE } from "./domain";
export function calendarWindow(mode: "NIGHTLY" | "HOURLY", value?: string) {
  try {
    if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error();
    const date = value ? Temporal.PlainDate.from(value) : Temporal.Now.plainDateISO(TIMEZONE);
    const first = mode === "NIGHTLY" ? date.with({ day: 1 }) : date;
    const next = mode === "NIGHTLY" ? first.add({ months: 1 }) : first.add({ days: 1 });
    const days = [];
    for (let day = first; Temporal.PlainDate.compare(day, next) < 0; day = day.add({ days: 1 })) {
      days.push({ date: day.toString(), label: day.day, startsAt: new Date(day.toZonedDateTime(TIMEZONE).epochMilliseconds),
        endsAt: new Date(day.add({ days: 1 }).toZonedDateTime(TIMEZONE).epochMilliseconds) });
    }
    return { date: date.toString(), first: first.toString(), startsAt: days[0].startsAt, endsAt: days.at(-1)!.endsAt,
      days, weekday: first.dayOfWeek, previous: (mode === "NIGHTLY" ? first.subtract({ months: 1 }) : first.subtract({ days: 1 })).toString(),
      next: next.toString() };
  } catch { throw new DomainError("INVALID_DATE", "Selecciona una fecha de calendario válida."); }
}
export function blockInterval(start: string, end: string) {
  try {
    const parse = (value: string) => {
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error();
      return Temporal.PlainDateTime.from(value).toZonedDateTime(TIMEZONE, { disambiguation: "reject" });
    };
    const startsAt = new Date(parse(start).epochMilliseconds), endsAt = new Date(parse(end).epochMilliseconds);
    if (!(startsAt < endsAt)) throw new Error();
    return { startsAt, endsAt };
  } catch { throw new DomainError("INVALID_INTERVAL", "Revisa inicio y salida: la salida debe ser posterior y las horas deben existir sin ambigüedad en Santiago."); }
}
export function calendarTime(value: Date) {
  const local = Temporal.Instant.fromEpochMilliseconds(+value).toZonedDateTimeISO(TIMEZONE);
  const seconds = local.second || local.millisecond ? `:${String(local.second).padStart(2,"0")}${local.millisecond ? `.${String(local.millisecond).padStart(3,"0")}` : ""}` : "";
  return `${local.toPlainDate()} ${String(local.hour).padStart(2, "0")}:${String(local.minute).padStart(2, "0")}${seconds} (UTC${local.offset})`;
}
