"use server";
import { requireAdmin } from "@/lib/require-admin";
import { getAdminRequest } from "@/lib/admin-data";
import { getDb } from "@/lib/db";
import { changeRequestStatus } from "@/modules/bookings/service";
import { DomainError, invariant } from "@/modules/bookings/domain";
import { identifier, text } from "@/modules/management/validation";
import type { FormState } from "@/components/action-form";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function requestStatusAction(_state: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  let id: string;
  try {
    id = identifier(form);
    const status = text(form, "status", 10);
    invariant(status === "CONFIRMED" || status === "REJECTED" || status === "CANCELLED", "INVALID_STATUS", "Selecciona una acción válida.");
    const request = await getAdminRequest(id);
    invariant(request, "REQUEST_NOT_FOUND", "La solicitud ya no existe.");
    invariant(request.status === (status === "CANCELLED" ? "CONFIRMED" : "PENDING"), "INVALID_STATUS", "El estado de esta solicitud cambió o no permite esa acción. Actualiza la página.");
    await changeRequestStatus(getDb(), id, status);
  } catch (error) {
    if (error instanceof DomainError) {
      if (error.code === "UNAVAILABLE") return { error: "No se pudo confirmar: las fechas dejaron de estar disponibles. La solicitud sigue pendiente; actualiza y revisa el período." };
      if (error.code === "INVALID_STATUS") return { error: "El estado de esta solicitud cambió o no permite esa acción. Actualiza la página." };
      return { error: error.message };
    }
    return { error: "No se pudo actualizar la solicitud. Actualiza la página e inténtalo nuevamente." };
  }
  revalidatePath("/admin", "layout");
  redirect(`/admin/solicitudes/${id}?saved=1`);
}
