import { clp, DomainError, invariant } from "../bookings/domain";
import { normalizeWhatsappNumber } from "../contact/whatsapp";
export function text(form: FormData, key: string, max = 200, required = true) {
  const value = form.get(key);
  invariant(typeof value === "string", "INVALID_INPUT", `Falta el campo ${key}.`);
  const result = value.trim();
  invariant((!required || result.length > 0) && result.length <= max, "INVALID_INPUT", `Revisa ${key}: ${required ? "es obligatorio y " : ""}admite hasta ${max} caracteres.`);
  return result;
}
export function number(form: FormData, key: string, min = 0, max = 2147483647) {
  const raw = text(form, key, 20);
  invariant(/^\d+$/.test(raw), "INVALID_INPUT", `${key} debe ser un número entero.`);
  const value = Number(raw);
  invariant(Number.isSafeInteger(value) && value >= min && value <= max, "INVALID_INPUT", `${key} debe estar entre ${min} y ${max}.`);
  return value;
}
export function identifier(form: FormData, key = "id") {
  const value = text(form, key, 36);
  invariant(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value), "INVALID_INPUT", "Identificador no válido.");
  return value;
}
export function imageUrl(value: string) {
  if (/^\/images\/[a-zA-Z0-9/_.%\-]+$/.test(value)) return value;
  try {
    const url = new URL(value);
    invariant(!url.username && !url.password && (url.protocol === "https:" ||
      (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))),
      "INVALID_IMAGE", "Usa /images/... o una URL HTTPS para las imágenes.");
    return url.href;
  } catch { throw new DomainError("INVALID_IMAGE", "Usa /images/... o una URL HTTPS válida para las imágenes."); }
}
export function cabinInput(form: FormData) {
  const mode = text(form, "mode");
  invariant(mode === "NIGHTLY" || mode === "HOURLY", "INVALID_INPUT", "Selecciona una modalidad válida.");
  const publicationStatus = text(form, "publicationStatus");
  invariant(["DRAFT", "PUBLISHED", "ARCHIVED"].includes(publicationStatus), "INVALID_INPUT", "Estado no válido.");
  const slug = text(form, "slug", 100);
  invariant(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug), "INVALID_INPUT", "La ruta admite letras minúsculas, números y guiones.");
  const amenities = [...new Set(text(form, "amenities", 3000, false).split(/\r?\n/).map(v => v.trim()).filter(Boolean))];
  invariant(amenities.length <= 30 && amenities.every(v => v.length <= 80), "INVALID_INPUT", "Usa hasta 30 servicios, de 80 caracteres cada uno.");
  const images = text(form, "images", 12000, false).split(/\r?\n/).map(v => v.trim()).filter(Boolean).map((line, position) => {
    const [url, ...rest] = line.split("|");
    const alt = rest.join("|").trim();
    invariant(url.trim().length <= 2000 && alt.length > 0 && alt.length <= 200, "INVALID_IMAGE", "Cada imagen necesita URL y texto alternativo: URL | descripción.");
    return { url: imageUrl(url.trim()), alt, position };
  });
  invariant(images.length <= 10 && (publicationStatus !== "PUBLISHED" || images.length > 0), "INVALID_IMAGE", "Usa hasta 10 imágenes; para publicar se necesita al menos una.");
  return { name: text(form, "name", 120), slug, description: text(form, "description", 5000), mode: mode as "NIGHTLY" | "HOURLY",
    capacity: number(form, "capacity", 1, 1000), bedrooms: number(form, "bedrooms", 0, 1000),
    baseRateClp: clp(number(form, "baseRateClp")), publicationStatus: publicationStatus as "DRAFT" | "PUBLISHED" | "ARCHIVED", amenities, images };
}
export const homeKeys = ["eyebrow", "catalogTitle", "catalogDescription", "storyTitle", "storyBody"] as const;
export function settingsInput(form: FormData) {
  const email = text(form, "contactEmail", 254).toLowerCase();
  invariant(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), "INVALID_INPUT", "Revisa el correo de contacto.");
  const notificationEmail = text(form, "notificationEmail", 254).toLowerCase();
  invariant(/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(notificationEmail), "INVALID_INPUT", "Revisa el correo para avisos.");
  const colors = { primaryColor: text(form, "primaryColor"), accentColor: text(form, "accentColor"), backgroundColor: text(form, "backgroundColor") };
  invariant(Object.values(colors).every(v => /^#[0-9a-f]{6}$/i.test(v)), "INVALID_INPUT", "Los colores deben usar formato #123456.");
  const logo = text(form, "logoUrl", 2000, false);
  const whatsappRaw = text(form, "whatsappNumber", 30, false);
  const whatsappNumber = whatsappRaw ? normalizeWhatsappNumber(whatsappRaw) : null;
  invariant(!whatsappRaw || whatsappNumber, "INVALID_INPUT", "Revisa el número de WhatsApp: usa formato internacional con código de país, por ejemplo +56 9 1234 5678.");
  return { name: text(form, "name", 120), tagline: text(form, "tagline", 200), description: text(form, "description", 5000),
    location: text(form, "location", 200), logoUrl: logo ? imageUrl(logo) : null,
    contactEmail: email, notificationEmail, contactPhone: text(form, "contactPhone", 40, false) || null, whatsappNumber, ...colors,
    cancellationPolicy: text(form, "cancellationPolicy", 10000), checkInHour: number(form, "checkInHour", 0, 23),
    checkOutHour: number(form, "checkOutHour", 0, 23), bookingPersonalDataRetentionMonths: number(form, "bookingPersonalDataRetentionMonths", 1, 1200),
    homeTexts: Object.fromEntries(homeKeys.map(key => [key, text(form, key, 3000)])) };
}
