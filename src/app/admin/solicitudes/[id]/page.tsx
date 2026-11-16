import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/require-admin";
import { getAdminRequest } from "@/lib/admin-data";
import { localPeriod, requestStatuses, storedBreakdown } from "@/modules/bookings/admin-view";
import { money } from "@/lib/format";
import { ActionForm } from "@/components/action-form";
import { requestStatusAction } from "../actions";

export default async function RequestDetail({ params, searchParams }: { params: Promise<{id: string}>; searchParams: Promise<{saved?: string}> }) {
  await requireAdmin();
  const request = await getAdminRequest((await params).id); if (!request) notFound();
  const lines = storedBreakdown(request.pricingSnapshot);
  function transition(status: "CONFIRMED" | "REJECTED" | "CANCELLED", label: string) {
    return <ActionForm action={requestStatusAction} label={label} kind={`request-${status.toLowerCase()}`}>
      <input type="hidden" name="id" value={request!.id}/><input type="hidden" name="status" value={status}/>
    </ActionForm>;
  }
  return <><Link className="back-link" href="/admin/solicitudes">← Todas las solicitudes</Link><p className="eyebrow">SOLICITUD</p><h1>{request.cabin.name}</h1>
    {(await searchParams).saved === "1" && <p role="status" className="notice">Estado actualizado. Estado actual: {requestStatuses[request.status]}.</p>}
    <section className="admin-panel"><h2>Período y estado</h2><dl className="request-facts">
      <div><dt>Estado</dt><dd>{requestStatuses[request.status]}</dd></div><div><dt>Modalidad guardada</dt><dd>{request.mode === "NIGHTLY" ? "Por noche" : "Por hora"}</dd></div>
      <div><dt>Inicio</dt><dd>{localPeriod(request.startsAt)}</dd></div><div><dt>Salida (excluida)</dt><dd>{localPeriod(request.endsAt)}</dd></div>
      <div><dt>Huéspedes</dt><dd>{request.guests}</dd></div><div><dt>Solicitada el</dt><dd>{localPeriod(request.createdAt)}</dd></div>
    </dl><p className="muted">America/Santiago · Los datos de la solicitud son de solo lectura.</p></section>
    <section className="admin-panel"><h2>Contacto del huésped</h2><dl className="request-facts"><div><dt>Nombre</dt><dd>{request.guestName}</dd></div><div><dt>Correo</dt><dd>{request.guestEmail}</dd></div><div><dt>Teléfono</dt><dd>{request.guestPhone || "No indicado"}</dd></div></dl></section>
    <section className="admin-panel"><h2>Precio guardado</h2><p className="price">{money(request.estimatedTotalClp)} <small>{request.currency}</small></p>
      <p>Se conserva el estimado de la solicitud; confirmar no recalcula ni modifica las tarifas o condiciones guardadas.</p>
      {lines?.length ? <ul className="season-prices">{lines.map((line, i) => <li key={i}><strong>{line.date}</strong><span>{line.units} {request.mode === "NIGHTLY" ? "noche(s)" : "hora(s)"} × {money(line.rateClp)} = {money(line.units * line.rateClp)}</span><span>{line.seasonal ? "Tarifa de temporada guardada" : "Tarifa base guardada"}</span></li>)}</ul> : <p>El desglose guardado no está disponible en un formato reconocido. No se recalcula con las tarifas actuales.</p>}
    </section>
    <section className="admin-panel"><h2>Gestionar estado</h2>
      {request.status === "PENDING" ? <><p>Confirmar vuelve a comprobar disponibilidad. Rechazar no ocupa el período.</p><div className="request-transitions">{transition("CONFIRMED", "Confirmar solicitud")}{transition("REJECTED", "Rechazar solicitud")}</div></> :
        request.status === "CONFIRMED" ? <><p>Cancelar libera el período. No realiza reembolsos ni envía mensajes.</p>{transition("CANCELLED", "Cancelar reserva confirmada")}</> : <p>Esta solicitud está {request.status === "REJECTED" ? "rechazada" : "cancelada"} y no permite nuevas transiciones.</p>}
      <p className="muted">No se envían correos ni WhatsApp. No se realizan pagos ni reembolsos automáticos.</p>
    </section></>;
}
