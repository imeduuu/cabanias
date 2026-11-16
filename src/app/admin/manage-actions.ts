"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";
import { cabinInput, identifier, number, settingsInput, text } from "@/modules/management/validation";
import { deleteCabin, saveCabin, setPublication } from "@/modules/management/service";
import { saveBusinessSettings } from "@/modules/settings/service";
import { saveSeasonalRate, removeSeasonalRate } from "@/modules/pricing/service";
import { DomainError, invariant } from "@/modules/bookings/domain";
import type { FormState } from "@/components/action-form";

function failure(error: unknown): FormState {
  if (error instanceof DomainError) return { error: error.message };
  const code = (error as { code?: string })?.code;
  if (code === "P2002") return { error: "La ruta ya existe. Elige una ruta distinta para esta cabaña." };
  if (code === "P2003") return { error: "Hay registros vinculados a esta cabaña. Despublícala en lugar de eliminarla." };
  if (code === "P2025") return { error: "El registro ya no existe. Actualiza la página." };
  return { error: "No se pudieron guardar los cambios. Revisa los datos e inténtalo nuevamente." };
}
function done(path: string): never { revalidatePath("/", "layout"); redirect(`${path}?saved=1`); }
export async function saveCabinAction(_state: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  let id: string;
  try {
    const existing = text(form, "id", 36, false);
    id = (await saveCabin(getDb(), cabinInput(form), existing ? identifier(form) : undefined)).id;
  } catch (error) { return failure(error); }
  done(`/admin/cabanas/${id}`);
}
export async function publicationAction(_state: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  try {
    const status = text(form, "published");
    invariant(status === "yes" || status === "no", "INVALID_INPUT", "Estado no válido.");
    await setPublication(getDb(), identifier(form), status === "yes");
  } catch (error) { return failure(error); }
  done("/admin/cabanas");
}
export async function deleteCabinAction(_state: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  try {
    invariant(form.get("confirmDelete") === "yes", "CONFIRM_DELETE", "Marca la confirmación para eliminar esta cabaña.");
    await deleteCabin(getDb(), identifier(form));
  } catch (error) { return failure(error); }
  done("/admin/cabanas");
}
export async function settingsAction(_state: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  try { await saveBusinessSettings(getDb(), settingsInput(form)); } catch (error) { return failure(error); }
  done("/admin/configuracion");
}
export async function seasonAction(_state: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  let cabinId: string;
  try {
    cabinId = identifier(form, "cabinId");
    const id = text(form, "id", 36, false) ? identifier(form) : undefined;
    await saveSeasonalRate(getDb(), { cabinId, id, name: text(form, "name", 100), startDate: text(form, "startDate", 10), endDate: text(form, "endDate", 10), rateClp: number(form, "rateClp") });
  } catch (error) { return failure(error); }
  done(`/admin/cabanas/${cabinId}`);
}
export async function deleteSeasonAction(_state: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  let cabinId: string;
  try { cabinId = identifier(form, "cabinId"); await removeSeasonalRate(getDb(), cabinId, identifier(form)); }
  catch (error) { return failure(error); }
  done(`/admin/cabanas/${cabinId}`);
}
