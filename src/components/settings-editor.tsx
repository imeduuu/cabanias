import { ActionForm } from "./action-form";
import { Field, TextArea } from "./admin-fields";
import { settingsAction } from "@/app/admin/manage-actions";
import type { getAdminSettings } from "@/lib/admin-data";
export function SettingsEditor({ settings: s }: { settings: Awaited<ReturnType<typeof getAdminSettings>> }) {
  const home = (s?.homeTexts ?? {}) as Record<string, string>;
  return <ActionForm action={settingsAction} label="Guardar configuración" kind="settings">
    <section className="admin-panel"><h2>Identidad y contacto</h2><div className="form-grid">
      <Field label="Nombre del negocio" name="name" defaultValue={s?.name} maxLength={120} required/>
      <Field label="Frase principal" name="tagline" defaultValue={s?.tagline} maxLength={200} required/>
      <Field label="Ubicación" name="location" defaultValue={s?.location} maxLength={200} required/>
      <Field label="Logo (ruta o URL)" name="logoUrl" defaultValue={s?.logoUrl ?? ""} maxLength={2000}/>
      <Field label="Correo de contacto público" name="contactEmail" type="email" defaultValue={s?.contactEmail} maxLength={254} required/>
      <Field label="Correo para avisos" name="notificationEmail" type="email" defaultValue={s?.notificationEmail} maxLength={254} required/>
      <Field label="Teléfono de contacto" name="contactPhone" defaultValue={s?.contactPhone ?? ""} maxLength={40}/>
      <Field label="WhatsApp (opcional, formato internacional)" name="whatsappNumber" type="tel" inputMode="tel" autoComplete="off" placeholder="+56 9 1234 5678" maxLength={30} defaultValue={s?.whatsappNumber ?? ""} aria-describedby="whatsapp-help"/>
      <Field label="Color principal" name="primaryColor" type="color" defaultValue={s?.primaryColor ?? "#244d40"} required/>
      <Field label="Color de acento" name="accentColor" type="color" defaultValue={s?.accentColor ?? "#bb5c37"} required/>
      <Field label="Color de fondo" name="backgroundColor" type="color" defaultValue={s?.backgroundColor ?? "#faf8f2"} required/>
    </div><p id="whatsapp-help" className="muted">Incluye el código de país (por ejemplo +56). Si lo dejas vacío, no se muestra el enlace de WhatsApp en las cabañas. No se envían mensajes automáticos.</p><p className="muted">Recibe avisos de nuevas solicitudes; no cambia el correo público ni el correo de acceso.</p><TextArea label="Descripción del negocio" name="description" defaultValue={s?.description} required/></section>
    <section className="admin-panel"><h2>Textos de inicio</h2>
      {[["eyebrow", "Antetítulo"], ["catalogTitle", "Título del catálogo"], ["catalogDescription", "Introducción al catálogo"], ["storyTitle", "Título de presentación"], ["storyBody", "Texto de presentación"]].map(([key, label]) => <TextArea key={key} label={label} name={key} defaultValue={home[key]} required maxLength={3000}/>)}</section>
    <section className="admin-panel"><h2>Horarios y políticas</h2><p>Moneda CLP · Zona horaria America/Santiago</p><div className="form-grid">
      <Field label="Hora de entrada por noche (0–23)" name="checkInHour" type="number" min={0} max={23} step={1} defaultValue={s?.checkInHour ?? 15} required/>
      <Field label="Hora de salida por noche (0–23)" name="checkOutHour" type="number" min={0} max={23} step={1} defaultValue={s?.checkOutHour ?? 11} required/>
    </div><TextArea label="Política de cancelación" name="cancellationPolicy" defaultValue={s?.cancellationPolicy} maxLength={10000} required/><p className="muted">Este texto es informativo. No se realizan reembolsos automáticos.</p></section>
  </ActionForm>;
}
