import { ActionForm } from "./action-form";
import { Field, TextArea } from "./admin-fields";
import { saveCabinAction, seasonAction, deleteSeasonAction } from "@/app/admin/manage-actions";
import type { getAdminCabin } from "@/lib/admin-data";
import { ImageUploader } from "./image-uploader";
type Cabin = NonNullable<Awaited<ReturnType<typeof getAdminCabin>>>;
export function CabinEditor({ cabin }: { cabin?: Cabin }) {
  return <><section className="admin-panel"><h2>Ficha y tarifa base</h2>
    <ActionForm action={saveCabinAction} label="Guardar cabaña" kind="cabin">
      <input type="hidden" name="id" value={cabin?.id ?? ""}/>
      <div className="form-grid">
        <Field label="Nombre" name="name" defaultValue={cabin?.name} maxLength={120} required/>
        <Field label="Ruta (ejemplo: refugio-bosque)" name="slug" defaultValue={cabin?.slug} pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={100} required/>
        <label className="form-field">Modalidad<select name="mode" defaultValue={cabin?.mode ?? "NIGHTLY"}><option value="NIGHTLY">Por noche</option><option value="HOURLY">Por hora</option></select></label>
        <label className="form-field">Publicación<select name="publicationStatus" defaultValue={cabin?.publicationStatus ?? "DRAFT"}><option value="DRAFT">Borrador / despublicada</option><option value="PUBLISHED">Publicada</option><option value="ARCHIVED">Archivada</option></select></label>
        <Field label="Capacidad de personas" name="capacity" type="number" min={1} max={1000} step={1} defaultValue={cabin?.capacity ?? 2} required/>
        <Field label="Dormitorios" name="bedrooms" type="number" min={0} max={1000} step={1} defaultValue={cabin?.bedrooms ?? 1} required/>
        <Field label="Tarifa base CLP por noche u hora" name="baseRateClp" type="number" min={0} max={2147483647} step={1} defaultValue={cabin?.baseRateClp ?? 0} required/>
      </div>
      <TextArea label="Descripción" name="description" defaultValue={cabin?.description} required/>
      <TextArea label="Servicios (uno por línea)" name="amenities" defaultValue={cabin?.amenities.map(a => a.amenity.name).join("\n")} maxLength={3000}/>
      <TextArea label="Imágenes (una por línea: URL | texto alternativo)" name="images" defaultValue={cabin?.images.map(i => `${i.url} | ${i.alt}`).join("\n")} maxLength={12000}/>
      <p className="muted">El orden de las líneas define la galería; la primera imagen es la portada. Hasta 10 imágenes. Usa /images/... o URL HTTPS. Puedes subir archivos JPEG, PNG o WebP.</p>
    </ActionForm></section>
    {cabin && <ImageUploader cabinId={cabin.id}/>}</>;
}
export function SeasonEditor({ cabin }: { cabin: Cabin }) {
  function fields(season?: Cabin["seasonalRates"][number]) {
    return <><input type="hidden" name="cabinId" value={cabin.id}/><input type="hidden" name="id" value={season?.id ?? ""}/><div className="form-grid">
      <Field label="Nombre de temporada" name="name" defaultValue={season?.name} maxLength={100} required/>
      <Field label="Tarifa CLP por unidad" name="rateClp" type="number" min={0} max={2147483647} step={1} defaultValue={season?.rateClp} required/>
      <Field label="Inicio incluido" name="startDate" type="date" defaultValue={season?.startDate.toISOString().slice(0, 10)} required/>
      <Field label="Fin excluido" name="endDate" type="date" defaultValue={season?.endDate.toISOString().slice(0, 10)} required/>
    </div></>;
  }
  return <section className="admin-panel"><h2>Tarifas por temporada</h2><p>Fechas de America/Santiago. La tarifa sustituye la base durante la temporada; el día de fin queda excluido. No se permiten superposiciones.</p>
    {cabin.seasonalRates.map(season => <div className="season-editor" key={season.id}>
      <ActionForm action={seasonAction} label="Guardar temporada" kind="season">{fields(season)}</ActionForm>
      <ActionForm action={deleteSeasonAction} label="Eliminar temporada" kind="delete-season"><input type="hidden" name="id" value={season.id}/><input type="hidden" name="cabinId" value={cabin.id}/></ActionForm>
    </div>)}
    <h3>Nueva temporada</h3><ActionForm action={seasonAction} label="Añadir temporada" kind="season">{fields()}</ActionForm>
  </section>;
}
