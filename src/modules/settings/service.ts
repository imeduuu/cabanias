import "server-only";
import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { CURRENCY, TIMEZONE, invariant } from "../bookings/domain";

export type SettingsInput = {
  name: string; tagline: string; description: string; location: string; logoUrl?: string | null;
  contactEmail: string; contactPhone?: string | null; primaryColor: string; accentColor: string;
  backgroundColor: string; homeTexts: Record<string, string>; cancellationPolicy: string;
  checkInHour: number; checkOutHour: number;
};
export function saveBusinessSettings(db: PrismaClient, input: SettingsInput) {
  invariant(input.name.trim() && input.cancellationPolicy.trim(), "INVALID_SETTINGS", "Nombre y política son obligatorios.");
  invariant(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.contactEmail.trim()), "INVALID_SETTINGS", "Correo no válido.");
  for (const color of [input.primaryColor, input.accentColor, input.backgroundColor]) {
    invariant(/^#[0-9a-f]{6}$/i.test(color), "INVALID_SETTINGS", "Usa colores hexadecimales de seis dígitos.");
  }
  for (const hour of [input.checkInHour, input.checkOutHour]) {
    invariant(Number.isInteger(hour) && hour >= 0 && hour <= 23, "INVALID_SETTINGS", "Hora no válida.");
  }
  invariant(Object.values(input.homeTexts).every(v => typeof v === "string"), "INVALID_SETTINGS", "Los textos deben ser cadenas.");
  const data = { ...input, name: input.name.trim(), contactEmail: input.contactEmail.trim().toLowerCase(),
    homeTexts: input.homeTexts as Prisma.InputJsonObject, timezone: TIMEZONE, currency: CURRENCY };
  return db.businessSettings.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
}
export function readBusinessSettings(db: PrismaClient) {
  return db.businessSettings.findUnique({ where: { id: 1 } });
}
