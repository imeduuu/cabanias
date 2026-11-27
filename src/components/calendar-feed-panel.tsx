"use client";
import { useActionState, useState } from "react";
import { calendarFeedAction, type FeedState } from "@/app/admin/cabanas/feed-actions";

export function CalendarFeedPanel({ cabinId, activeSince }: { cabinId: string; activeSince: string | null }) {
  const [state, submit, pending] = useActionState<FeedState, FormData>(calendarFeedAction, { error: "" });
  const [copied, setCopied] = useState(false);
  const active = activeSince !== null || !!state.url;
  return <section className="admin-panel feed-panel"><h2>Calendario iCal (solo ocupación)</h2>
    <p>Incluye reservas confirmadas y bloqueos como “Ocupado”. Las solicitudes pendientes no aparecen. Rotar invalida el enlace anterior; los calendarios suscritos pueden tardar horas en actualizarse.</p>
    <p>{active ? `Enlace activo${activeSince ? ` desde ${activeSince}` : ""}.` : "Aún no hay enlace."}</p>
    <form action={submit} className="management-form" data-management="calendar-feed">
      <fieldset disabled={pending}>
        <input type="hidden" name="cabinId" value={cabinId}/>
        {active && <label className="delete-check"><input type="checkbox" name="confirmRotate" value="yes" required/> Confirmo rotar el enlace: el anterior dejará de funcionar</label>}
      </fieldset>
      {state.error && <p role="alert" className="form-error">{state.error}</p>}
      <button className="button" disabled={pending}>{pending ? "Generando…" : active ? "Rotar enlace" : "Generar enlace"}</button>
    </form>
    {state.url && <div className="feed-result">
      <input className="feed-url" readOnly value={state.url} aria-label="Enlace del calendario" onFocus={event => event.currentTarget.select()}/>
      <button type="button" className="button secondary" onClick={() => { void navigator.clipboard?.writeText(state.url!).then(() => setCopied(true)); }}>{copied ? "Copiado" : "Copiar"}</button>
      <p className="notice">Copia este enlace ahora: por seguridad no volverá a mostrarse. Quien lo tenga verá las fechas ocupadas, sin datos de huéspedes.</p>
    </div>}
  </section>;
}
