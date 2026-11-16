import Link from "next/link";
import { requireAdmin } from "@/lib/require-admin";
import { calendarCabins, calendarEntries } from "@/lib/calendar-data";
import { calendarTime } from "@/modules/bookings/calendar";
import { overlaps, DomainError } from "@/modules/bookings/domain";
import { ActionForm } from "@/components/action-form";
import { Field, TextArea } from "@/components/admin-fields";
import { blockAction } from "./actions";
type Data = Awaited<ReturnType<typeof calendarEntries>>;
const labels = { CONFIRMED: "Reserva confirmada · ocupado", BLOCK: "Bloqueo manual · ocupado", PENDING: "Solicitud pendiente · no ocupa" };
export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string,string|string[]|undefined>> }) {
  await requireAdmin(); const cabins = await calendarCabins(); const query = await searchParams;
  if (!cabins.length) return <><h1>Calendario</h1><p>Crea una cabaña para consultar su calendario.</p><Link className="button" href="/admin/cabanas/nueva">Crear cabaña</Link></>;
  let data: Data;
  try {
    if (Array.isArray(query.cabinId) || Array.isArray(query.date)) throw new DomainError("INVALID_INPUT", "Usa un solo valor por filtro.");
    data = await calendarEntries(query.cabinId || cabins[0].id, query.date);
  } catch (error) { return <><h1>Calendario</h1><p className="form-error" role="alert">{error instanceof DomainError ? error.message : "No pudimos cargar el calendario."}</p><Link href="/admin/calendario">Restablecer selección</Link></>; }
  const { cabin, window, entries } = data;
  const href = (date: string) => `/admin/calendario?cabinId=${cabin.id}&date=${date}`;
  function event(entry: Data["entries"][number]) {
    return <div key={`${entry.kind}-${entry.id}`} className={`calendar-event event-${entry.kind.toLowerCase()}`}>
      <strong>{labels[entry.kind]}</strong><span>{calendarTime(entry.startsAt)} → {calendarTime(entry.endsAt)} (salida excluida)</span>
      {entry.kind === "BLOCK" ? <p className="preserve-lines">{entry.reason}</p> : <Link href={`/admin/solicitudes/${entry.id}`}>Abrir solicitud ↗</Link>}
    </div>;
  }
  return <><p className="eyebrow">DISPONIBILIDAD ADMINISTRATIVA</p><h1>Calendario</h1>
    <form className="admin-panel calendar-selector" method="get" action="/admin/calendario"><label className="form-field">Cabaña<select name="cabinId" defaultValue={cabin.id}>{cabins.map(c => <option key={c.id} value={c.id}>{c.name} · {c.mode === "NIGHTLY" ? "Por noche" : "Por hora"}</option>)}</select></label><Field label="Fecha de referencia (Santiago)" name="date" type="date" defaultValue={window.date} required/><button className="button">Ver calendario</button></form>
    <h2>{cabin.name} · {cabin.mode === "NIGHTLY" ? window.first.slice(0,7) : window.date}</h2>
    <nav className="request-pagination" aria-label="Navegar fechas"><Link className="button secondary" href={href(window.previous)}>← {cabin.mode === "NIGHTLY" ? "Mes anterior" : "Día anterior"}</Link><Link className="button secondary" href={`/admin/calendario?cabinId=${cabin.id}`}>Hoy</Link><Link className="button secondary" href={href(window.next)}>{cabin.mode === "NIGHTLY" ? "Mes siguiente" : "Día siguiente"} →</Link></nav>
    <p className="muted">America/Santiago · Las pendientes son avisos y no bloquean disponibilidad. Los eventos muestran sus horas reales, no implican días completos ocupados.</p>
    {query.saved === "1" && <p role="status" className="notice">Cambio guardado. Calendario actualizado.</p>}
    {data.truncated && <p role="alert" className="form-error">Se alcanzó el límite de 500 solicitudes o bloqueos del período. La vista es parcial; no la uses para deducir disponibilidad. Las comprobaciones al crear bloqueos consideran todos los registros.</p>}
    {cabin.mode === "NIGHTLY" && <div className="month-desktop"><div className="month-grid" aria-label="Calendario mensual">{["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"].map(label=><div className="month-weekday" key={label}>{label}</div>)}{Array.from({length:window.weekday-1},(_,i)=><div key={`empty-${i}`} aria-hidden="true"/>)}{window.days.map(day=><section className="month-day" key={day.date}><h3>{day.label}</h3>{entries.filter(e=>overlaps(e,day)).map(event)}</section>)}</div></div>}
    <div className={cabin.mode === "NIGHTLY" ? "month-mobile" : "day-agenda"}>
      {window.days.filter(day=>cabin.mode === "HOURLY" || entries.some(e=>overlaps(e,day))).map(day=><section className="admin-panel" key={day.date}><h3>{day.date}</h3>{entries.filter(e=>overlaps(e,day)).map(event)}{!entries.some(e=>overlaps(e,day)) && <p>Sin reservas confirmadas, bloqueos o avisos pendientes para este día.</p>}</section>)}
    </div>
    {!entries.length && <p className="admin-panel">No hay eventos en este período.</p>}
    <section className="admin-panel"><h2>Crear bloqueo manual</h2><p>Indica el intervalo exacto en Santiago, también para cabañas por noche. La salida no se incluye. No se editan reservas ni precios.</p>
      <ActionForm action={blockAction} label="Crear bloqueo" kind="block-create"><input type="hidden" name="operation" value="create"/><input type="hidden" name="cabinId" value={cabin.id}/><input type="hidden" name="date" value={window.date}/><div className="form-grid"><Field label="Inicio incluido" name="startsAt" type="datetime-local" step={60} required/><Field label="Salida excluida" name="endsAt" type="datetime-local" step={60} required/></div><TextArea label="Motivo" name="reason" maxLength={500} required/></ActionForm>
    </section>
    <section className="admin-panel"><h2>Bloqueos del período</h2>{entries.filter(e=>e.kind === "BLOCK").map(block=><div className="block-management" key={block.id}>{event(block)}<ActionForm action={blockAction} label="Eliminar bloqueo" kind="block-delete"><input type="hidden" name="operation" value="delete"/><input type="hidden" name="cabinId" value={cabin.id}/><input type="hidden" name="date" value={window.date}/><input type="hidden" name="id" value={block.id}/><label className="delete-check"><input type="checkbox" name="confirmDelete" value="yes" required/> Confirmo eliminar este bloqueo y liberar su intervalo</label></ActionForm></div>)}{!entries.some(e=>e.kind === "BLOCK") && <p>No hay bloqueos manuales en el período seleccionado.</p>}</section>
  </>;
}
