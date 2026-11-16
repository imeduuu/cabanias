import Link from "next/link";
import { requireAdmin } from "@/lib/require-admin";
import { listAdminRequests } from "@/lib/admin-data";
import { requestFilters, requestStatuses, localPeriod } from "@/modules/bookings/admin-view";
import { DomainError } from "@/modules/bookings/domain";
import { money } from "@/lib/format";
type Query = Record<string, string | string[] | undefined>;
export default async function Requests({searchParams}: {searchParams: Promise<Query>}) {
 await requireAdmin(); const query = await searchParams;
 let filters: ReturnType<typeof requestFilters>; try { filters = requestFilters(query); } catch (error) {
  return <><h1>Solicitudes</h1><p className="form-error" role="alert">{error instanceof DomainError ? error.message : "Revisa los filtros."}</p><Link className="button secondary" href="/admin/solicitudes">Restablecer filtros</Link></>;
 }
 const {requests, total} = await listAdminRequests(filters);
 function pageLink(page: number) { const params = new URLSearchParams(); if(filters.status) params.set("status",filters.status); if(filters.fromText) params.set("from",filters.fromText); if(filters.toText) params.set("to",filters.toText); params.set("page",String(page)); return `/admin/solicitudes?${params}`; }
 return <><p className="eyebrow">RESERVAS</p><h1>Solicitudes</h1><p className="intro">Revisa los datos guardados y gestiona cada solicitud desde su detalle.</p>
 <form className="admin-panel request-filters" method="get" action="/admin/solicitudes">
 <label className="form-field">Estado<select name="status" defaultValue={filters.status ?? ""}><option value="">Todos los estados</option>{Object.entries(requestStatuses).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
 <label className="form-field">Desde (fecha local)<input type="date" name="from" defaultValue={filters.fromText}/></label>
 <label className="form-field">Hasta (fecha local, incluida)<input type="date" name="to" defaultValue={filters.toText}/></label>
 <button className="button" type="submit">Filtrar</button><Link className="button secondary" href="/admin/solicitudes">Limpiar</Link>
 <p className="muted filter-help">Incluye estadías que coinciden con cualquier parte de estos días en America/Santiago. Se filtra por período de estadía, no por fecha de envío.</p>
 </form>
 <p role="status">{total} solicitudes · Página {filters.page} de {Math.max(1, Math.ceil(total / 20))}</p>
 <div className="request-list">{requests.map(request=><article className="admin-panel request-card" key={request.id}>
 <div className="request-card-heading"><h2><Link href={`/admin/solicitudes/${request.id}`}>{request.cabin.name}</Link></h2><span className="badge">{requestStatuses[request.status]}</span></div>
 <dl className="request-facts"><div><dt>Huésped</dt><dd>{request.guestName} · {request.guests} personas</dd></div><div><dt>Modalidad</dt><dd>{request.mode === "NIGHTLY" ? "Por noche" : "Por hora"}</dd></div><div><dt>Inicio</dt><dd>{localPeriod(request.startsAt)}</dd></div><div><dt>Salida excluida</dt><dd>{localPeriod(request.endsAt)}</dd></div><div><dt>Total guardado</dt><dd>{money(request.estimatedTotalClp)}</dd></div></dl>
 <Link className="button secondary" href={`/admin/solicitudes/${request.id}`}>Abrir detalle</Link>
 </article>)}</div>
 {!requests.length && <section className="admin-panel"><h2>No hay solicitudes en esta página</h2><p>Prueba otros filtros o vuelve a la primera página.</p></section>}
 <nav className="request-pagination" aria-label="Páginas de solicitudes">{filters.page>1 && <Link className="button secondary" href={pageLink(filters.page-1)}>← Anterior</Link>}{filters.page*20<total && <Link className="button secondary" href={pageLink(filters.page+1)}>Siguiente →</Link>}</nav></>;
}
