"use server";
import { requireAdmin } from "@/lib/require-admin";
import { getDb } from "@/lib/db";
import { createManualBlock, removeManualBlock } from "@/modules/bookings/service";
import { blockInterval, calendarWindow } from "@/modules/bookings/calendar";
import { identifier, text } from "@/modules/management/validation";
import { DomainError, invariant } from "@/modules/bookings/domain";
import type { FormState } from "@/components/action-form";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
export async function blockAction(_state: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  let cabinId: string, date: string;
  try {
    cabinId = identifier(form, "cabinId");
    date = calendarWindow("HOURLY", text(form, "date", 10)).date;
    const operation = text(form, "operation", 10);
    if (operation === "create") {
      const range = blockInterval(text(form, "startsAt", 16), text(form, "endsAt", 16));
      await createManualBlock(getDb(), { cabinId, ...range, reason: text(form, "reason", 500) });
    } else {
      invariant(operation === "delete", "INVALID_INPUT", "Selecciona una acción válida.");
      invariant(form.get("confirmDelete") === "yes", "INVALID_INPUT", "Confirma que deseas eliminar el bloqueo.");
      const id = identifier(form);
      const block = await getDb().manualBlock.findUnique({ where: { id }, select: { cabinId: true } });
      invariant(block?.cabinId === cabinId, "BLOCK_NOT_FOUND", "El bloqueo ya no existe o no pertenece a esta cabaña.");
      await removeManualBlock(getDb(), id);
    }
  } catch (error) {
    if (error instanceof DomainError) return { error: error.code === "UNAVAILABLE"
      ? "No se pudo crear el bloqueo: el intervalo choca con una reserva confirmada u otro bloqueo. Revisa las fechas." : error.message };
    return { error: "No se pudo guardar el cambio. Actualiza el calendario e inténtalo nuevamente." };
  }
  revalidatePath("/admin", "layout");
  redirect(`/admin/calendario?cabinId=${cabinId}&date=${date}&saved=1`);
}
