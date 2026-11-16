import "server-only";
import type { PrismaClient } from "../../generated/prisma/client";
import { clp, invariant } from "../bookings/domain";

export async function saveSeasonalRate(db: PrismaClient, input: {
  cabinId: string; id?: string; name: string; startDate: string; endDate: string; rateClp: number;
}) {
  function date(value: string) {
    const result = new Date(`${value}T00:00:00.000Z`);
    invariant(/^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(+result) && result.toISOString().slice(0, 10) === value,
      "INVALID_SEASON", "Usa fechas de calendario válidas YYYY-MM-DD.");
    return result;
  }
  const startDate = date(input.startDate), endDate = date(input.endDate);
  invariant(startDate < endDate, "INVALID_SEASON", "El fin de temporada debe ser posterior a su inicio.");
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Cabin" WHERE id = ${input.cabinId}::uuid FOR UPDATE`;
    invariant(await tx.cabin.findUnique({ where: { id: input.cabinId } }), "NOT_FOUND", "La cabaña ya no existe.");
    if (input.id) invariant(await tx.seasonalRate.findFirst({ where: { id: input.id, cabinId: input.cabinId } }), "NOT_FOUND", "La tarifa ya no existe.");
    const conflict = await tx.seasonalRate.findFirst({ where: { cabinId: input.cabinId, ...(input.id ? { id: { not: input.id } } : {}), startDate: { lt: endDate }, endDate: { gt: startDate } } });
    invariant(!conflict, "SEASON_OVERLAP", "Las fechas se superponen con otra temporada de esta cabaña.");
    const data = { cabinId: input.cabinId, name: input.name, startDate, endDate, rateClp: clp(input.rateClp) };
    return input.id ? tx.seasonalRate.update({ where: { id: input.id }, data }) : tx.seasonalRate.create({ data });
  });
}
export async function removeSeasonalRate(db: PrismaClient, cabinId: string, id: string) {
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Cabin" WHERE id = ${cabinId}::uuid FOR UPDATE`;
    const result = await tx.seasonalRate.deleteMany({ where: { cabinId, id } });
    invariant(result.count, "NOT_FOUND", "La tarifa ya no existe.");
  });
}

export function setBaseRate(db: PrismaClient, cabinId: string, rateClp: number) {
  return db.cabin.update({ where: { id: cabinId }, data: { baseRateClp: clp(rateClp) } });
}
export function addSeasonalRate(db: PrismaClient, input: {
  cabinId: string; name: string; startDate: string; endDate: string; rateClp: number;
}) {
  function localDate(value: string) {
    const date = new Date(`${value}T00:00:00.000Z`);
    invariant(/^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(+date) && date.toISOString().slice(0, 10) === value,
      "INVALID_SEASON", "Usa fechas de calendario válidas YYYY-MM-DD.");
    return date;
  }
  const startDate = localDate(input.startDate), endDate = localDate(input.endDate);
  invariant(startDate < endDate && input.name.trim(), "INVALID_SEASON", "Temporada no válida.");
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Cabin" WHERE id = ${input.cabinId}::uuid FOR UPDATE`;
    const conflict = await tx.seasonalRate.findFirst({ where: { cabinId: input.cabinId,
      startDate: { lt: endDate }, endDate: { gt: startDate } } });
    invariant(!conflict, "SEASON_OVERLAP", "Las temporadas no pueden superponerse.");
    return tx.seasonalRate.create({ data: { cabinId: input.cabinId, name: input.name.trim(),
      startDate, endDate, rateClp: clp(input.rateClp) } });
  });
}
