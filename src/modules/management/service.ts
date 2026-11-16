import "server-only";
import type { PrismaClient } from "../../generated/prisma/client";
import { invariant } from "../bookings/domain";
import { cabinInput } from "./validation";

export async function saveCabin(db: PrismaClient, input: ReturnType<typeof cabinInput>, id?: string) {
  return db.$transaction(async tx => {
    if (id) {
      await tx.$queryRaw`SELECT id FROM "Cabin" WHERE id = ${id}::uuid FOR UPDATE`;
      const previous = await tx.cabin.findUnique({ where: { id }, include: { _count: { select: { requests: true } } } });
      invariant(previous, "NOT_FOUND", "La cabaña ya no existe.");
      invariant(previous.mode === input.mode || !previous._count.requests, "HAS_HISTORY", "No puedes cambiar la modalidad de una cabaña con solicitudes históricas.");
      const exceeds = await tx.bookingRequest.findFirst({ where: { cabinId: id, status: { in: ["PENDING", "CONFIRMED"] }, guests: { gt: input.capacity } }, select: { id: true } });
      invariant(!exceeds, "HAS_HISTORY", "La capacidad no puede ser menor a la de una solicitud activa.");
      await tx.cabinImage.deleteMany({ where: { cabinId: id } });
      await tx.cabinAmenity.deleteMany({ where: { cabinId: id } });
    }
    const { images, amenities, ...fields } = input;
    const services = [];
    for (const name of amenities) services.push(await tx.amenity.upsert({ where: { name }, create: { name }, update: {} }));
    const data = { ...fields, images: { create: images }, amenities: { create: services.map(service => ({ amenity: { connect: { id: service.id } } })) } };
    return id ? tx.cabin.update({ where: { id }, data }) : tx.cabin.create({ data });
  });
}

export async function setPublication(db: PrismaClient, id: string, published: boolean) {
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Cabin" WHERE id = ${id}::uuid FOR UPDATE`;
    const cabin = await tx.cabin.findUnique({ where: { id }, include: { images: true } });
    invariant(cabin, "NOT_FOUND", "La cabaña ya no existe.");
    invariant(!published || cabin.images.length > 0, "INVALID_IMAGE", "Agrega al menos una imagen antes de publicar.");
    return tx.cabin.update({ where: { id }, data: { publicationStatus: published ? "PUBLISHED" : "DRAFT" } });
  });
}

export async function deleteCabin(db: PrismaClient, id: string) {
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Cabin" WHERE id = ${id}::uuid FOR UPDATE`;
    const cabin = await tx.cabin.findUnique({ where: { id }, include: { _count: { select: { requests: true, blocks: true } } } });
    invariant(cabin, "NOT_FOUND", "La cabaña ya no existe.");
    invariant(!cabin._count.requests && !cabin._count.blocks, "HAS_HISTORY", "Esta cabaña tiene solicitudes o bloqueos históricos. Puedes despublicarla, pero no eliminarla.");
    return tx.cabin.delete({ where: { id } });
  });
}
