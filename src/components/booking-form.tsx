"use client";
import { useActionState, useState } from "react";
import { publicBookingAction } from "@/app/(public)/cabanas/booking-actions";
import { money } from "@/lib/format";
import type { PublicBookingState } from "@/modules/bookings/public-types";

type Props = { slug: string; mode: "night" | "hour"; capacity: number; submissionKey: string };
export function BookingForm(props: Props) {
  const [intent,setIntent] = useState({key:props.submissionKey,generation:0});
  return <BookingFormContent key={intent.generation} {...props} submissionKey={intent.key}
    onNew={key=>setIntent(previous=>({key,generation:previous.generation+1}))}/>;
}
function BookingFormContent({ slug, mode, capacity, submissionKey, onNew }: Props & {onNew: (key: string)=>void}) {
  const [state, action, pending] = useActionState<PublicBookingState, FormData>(publicBookingAction, {});
  const [values, setValues] = useState<Record<string, string>>({ guests: "1", hour: "15", duration: "1", ...state.selection });
  const [dirty, setDirty] = useState(false);
  const quote = dirty ? undefined : state.quote;
  function field(name: string, label: string, type: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) {
    return <label className="form-field" htmlFor={`booking-${slug}-${name}`}>{label}<input id={`booking-${slug}-${name}`} name={name} type={type}
      value={values[name] ?? ""} onChange={event => { setValues(previous => ({ ...previous, [name]: event.target.value })); if (!["guestName", "guestEmail", "guestPhone"].includes(name)) setDirty(true); }} {...extra}/></label>;
  }
  if (state.success) return <section className="booking-success" role="status" tabIndex={-1}>
    <h3>Solicitud recibida</h3><p>El envío se registró para revisión. Los reintentos del mismo envío no crean otra solicitud. <strong>Esta recepción no confirma ni garantiza una reserva.</strong> Se requiere aceptación del dueño.</p>
    <p>No se realizó ningún cobro.</p><button className="button secondary" type="button" onClick={()=>onNew(state.nextSubmissionKey!)}>Iniciar otra solicitud intencional</button>
  </section>;
  const local = (value: string) => new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  return <form action={action} className="management-form booking-form" data-management="public-booking"
    onSubmit={event => { const intent = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value"); if (intent === "quote") setDirty(false); }}>
    <h3>Consulta y solicita tu estadía</h3><p className="muted">Fechas y horas de America/Santiago. La salida es el límite exclusivo.</p>
    <input type="hidden" name="slug" value={slug}/><input type="hidden" name="mode" value={mode === "night" ? "NIGHTLY" : "HOURLY"}/>
    <input type="hidden" name="submissionKey" value={submissionKey}/>
    <input type="hidden" name="quoteToken" value={quote?.token ?? ""}/>
    <div className="booking-trap" aria-hidden="true"><label>Sitio web<input name="website" tabIndex={-1} autoComplete="off"/></label></div>
    <fieldset disabled={pending}>
      {mode === "night" ? <>{field("arrivalDate", "Llegada", "date", { required: true })}{field("departureDate", "Salida", "date", { required: true })}</> : <>
        {field("date", "Fecha", "date", { required: true })}
        {field("hour", "Hora de inicio (0–23, en punto)", "number", { min: 0, max: 23, step: 1, required: true })}
        {field("duration", "Duración en horas completas", "number", { min: 1, max: 8784, step: 1, required: true })}
      </>}
      {field("guests", `Huéspedes (máximo ${capacity})`, "number", { min: 1, max: capacity, step: 1, required: true })}
      <button className="button secondary" type="submit" name="intent" value="quote" formNoValidate disabled={pending}>Consultar disponibilidad y precio</button>
      {quote && <section className="quote-result" aria-live="polite"><h3>Período disponible para solicitar</h3><p>{local(quote.startsAt)} → {local(quote.endsAt)}</p>
        <p className="price">{money(quote.totalClp)} <small>CLP estimados</small></p>
        <details><summary>Ver desglose estimado</summary><ul className="season-prices">{quote.lines.map((line, i) => <li key={i}>{line.date}: {line.units} {mode === "night" ? "noche(s)" : "hora(s)"} × {money(line.rateClp)}</li>)}</ul></details>
        <p>Este estimado vence en cinco minutos. Al enviar se vuelven a comprobar el período y las tarifas.</p>
        {field("guestName", "Nombre de contacto", "text", { required: true, maxLength: 120, autoComplete: "name" })}
        {field("guestEmail", "Correo electrónico", "email", { required: true, maxLength: 254, autoComplete: "email" })}
        {field("guestPhone", "Teléfono (opcional)", "tel", { maxLength: 40, autoComplete: "tel" })}
        <label className="booking-ack"><input name="acknowledgement" type="checkbox" value="yes" required/> Entiendo que enviar esta solicitud no confirma ni garantiza la reserva. El dueño debe aceptarla.</label>
        <button className="button" type="submit" name="intent" value="request" disabled={pending}>Enviar solicitud pendiente</button>
      </section>}
    </fieldset>
    {dirty && state.quote && <p role="status">Cambiaste la selección. Consulta nuevamente para actualizar el estimado.</p>}
    {state.error && <p className="form-error" role="alert">{state.error}</p>}
    {pending && <p role="status">Procesando…</p>}
    <p className="muted">Consultar no bloquea el período. Las solicitudes pendientes tampoco lo bloquean; la disponibilidad puede cambiar. No se realizan pagos ni se envían mensajes automáticos.</p>
  </form>;
}
