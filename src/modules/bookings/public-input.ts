import { Temporal } from "@js-temporal/polyfill";
import { DomainError, invariant, TIMEZONE, type StayInput } from "./domain";

export function field(form: FormData, key: string, max: number, optional = false) {
  const raw = form.get(key);
  invariant(typeof raw === "string" || (optional && raw === null), "INVALID_FORM", "Revisa los campos del formulario.");
  const value = (raw ?? "").trim();
  invariant(value.length <= max && (optional || value.length > 0), "INVALID_FORM", "Completa los campos obligatorios sin superar su longitud máxima.");
  return value;
}
function integer(form: FormData, key: string, min: number, max: number) {
  const raw = field(form, key, 10);
  invariant(/^\d+$/.test(raw), "INVALID_FORM", "Las horas, duración y cantidad de personas deben ser números enteros.");
  const value = Number(raw);
  invariant(Number.isSafeInteger(value) && value >= min && value <= max, "INVALID_FORM", "Revisa la duración, las horas y la cantidad de personas.");
  return value;
}
export function publicStayInput(form: FormData): { stay: StayInput; guests: number } {
  const mode = field(form, "mode", 10);
  const guests = integer(form, "guests", 1, 1000);
  if (mode === "NIGHTLY") return { guests, stay: { mode, arrivalDate: field(form, "arrivalDate", 10), departureDate: field(form, "departureDate", 10) } };
  invariant(mode === "HOURLY", "MODE_MISMATCH", "La modalidad no corresponde a esta cabaña.");
  const date = field(form, "date", 10), hour = integer(form, "hour", 0, 23), duration = integer(form, "duration", 1, 24 * 366);
  try {
    invariant(/^\d{4}-\d{2}-\d{2}$/.test(date), "INVALID_DATE", "Selecciona una fecha válida.");
    const day = Temporal.PlainDate.from(date);
    const start = Temporal.ZonedDateTime.from({ timeZone: TIMEZONE, year: day.year, month: day.month, day: day.day, hour }, { disambiguation: "reject" });
    return { guests, stay: { mode, startsAt: start.toInstant().toString(), endsAt: start.add({ hours: duration }).toInstant().toString() } };
  } catch { throw new DomainError("INVALID_DATE", "La fecha u hora no existe o es ambigua en Santiago. Elige otra hora."); }
}
