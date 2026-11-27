"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";
import { identifier } from "@/modules/management/validation";
import { DomainError, invariant } from "@/modules/bookings/domain";
import { issueCalendarFeed } from "@/modules/calendar-feed/service";

export type FeedState = { error: string; url?: string };

const BASE_URL_MESSAGE = "Falta configurar una dirección pública válida del sitio (BETTER_AUTH_URL).";

function publicOrigin(base: string | undefined): string {
  invariant(base, "MISSING_BASE_URL", BASE_URL_MESSAGE);
  try {
    return new URL(base).origin;
  } catch {
    throw new DomainError("MISSING_BASE_URL", BASE_URL_MESSAGE);
  }
}

// Does not redirect: the new URL is only returned in this response and never stored in clear text.
export async function calendarFeedAction(_state: FeedState, form: FormData): Promise<FeedState> {
  await requireAdmin();
  try {
    const cabinId = identifier(form, "cabinId");
    const db = getDb();
    const existing = await db.cabinCalendarFeed.findUnique({ where: { cabinId }, select: { cabinId: true } });
    invariant(!existing || form.get("confirmRotate") === "yes", "CONFIRM_ROTATE", "Marca la confirmación: el enlace anterior dejará de funcionar.");
    // Resolve the public origin before rotating, so a bad configuration never invalidates the current link.
    const origin = publicOrigin(process.env.BETTER_AUTH_URL);
    const { token } = await issueCalendarFeed(db, cabinId);
    revalidatePath(`/admin/cabanas/${cabinId}`);
    return { error: "", url: new URL(`/api/calendar/${token}.ics`, origin).toString() };
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    return { error: "No se pudo generar el enlace. Inténtalo nuevamente." };
  }
}
