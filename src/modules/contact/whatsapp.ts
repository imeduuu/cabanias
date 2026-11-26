// Pure helpers (no server-only imports): used by both server and client components.
export const WHATSAPP_E164 = /^\+[1-9]\d{6,14}$/;

export type WhatsappStay =
  | { mode: "NIGHTLY"; arrivalDate: string; departureDate: string; guests: number }
  | { mode: "HOURLY"; date: string; hour: number; duration: number; guests: number };

export function normalizeWhatsappNumber(raw: string): string | null {
  let value = raw.trim();
  if (value.startsWith("00")) value = `+${value.slice(2)}`;
  if (!value.startsWith("+") || value.indexOf("+", 1) !== -1) return null;
  value = value.replace(/[\s\-.()]/g, "");
  return WHATSAPP_E164.test(value) ? value : null;
}
export function isWhatsappNumber(value: string) { return WHATSAPP_E164.test(value); }

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const INTEGER = /^\d+$/;
function integer(value: string | undefined, min: number, max = 100000) {
  if (value === undefined || !INTEGER.test(value)) return undefined;
  const parsed = Number(value);
  return parsed >= min && parsed <= max ? parsed : undefined;
}
export function stayFromSelection(mode: "night" | "hour", selection?: Record<string, string>): WhatsappStay | undefined {
  if (!selection) return undefined;
  const guests = integer(selection.guests, 1);
  if (guests === undefined) return undefined;
  if (mode === "night") {
    const arrivalDate = selection.arrivalDate, departureDate = selection.departureDate;
    if (!arrivalDate || !departureDate || !DATE.test(arrivalDate) || !DATE.test(departureDate)) return undefined;
    return { mode: "NIGHTLY", arrivalDate, departureDate, guests };
  }
  const date = selection.date, hour = integer(selection.hour, 0, 23), duration = integer(selection.duration, 1);
  if (!date || !DATE.test(date) || hour === undefined || duration === undefined) return undefined;
  return { mode: "HOURLY", date, hour, duration, guests };
}

const day = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
export function buildWhatsappMessage(cabinName: string, stay?: WhatsappStay): string {
  const base = `Hola, me interesa la cabaña «${cabinName}»`;
  const ask = "¿Me pueden dar más información?";
  if (!stay) return `${base}. ${ask}`;
  const guests = plural(stay.guests, "huésped", "huéspedes");
  if (stay.mode === "NIGHTLY") return `${base} con llegada el ${day(stay.arrivalDate)} y salida el ${day(stay.departureDate)}, para ${guests}. ${ask}`;
  return `${base} el ${day(stay.date)} desde las ${String(stay.hour).padStart(2, "0")}:00 por ${plural(stay.duration, "hora", "horas")}, para ${guests}. ${ask}`;
}
export function whatsappLink(number: string | null | undefined, cabinName: string, stay?: WhatsappStay): string | null {
  if (!number || !isWhatsappNumber(number)) return null;
  return `https://wa.me/${number.slice(1)}?text=${encodeURIComponent(buildWhatsappMessage(cabinName, stay))}`;
}
