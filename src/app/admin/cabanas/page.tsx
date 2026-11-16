import Link from "next/link";
import { requireAdmin } from "@/lib/require-admin";
import { listAdminCabins } from "@/lib/admin-data";
import { money } from "@/lib/format";
import { ActionForm } from "@/components/action-form";
import { StatusMessage } from "@/components/admin-fields";
import { publicationAction, deleteCabinAction } from "../manage-actions";
export default async function AdminCabins({ searchParams }: {searchParams: Promise<{saved?: string}>}) {
  await requireAdmin(); const cabins = await listAdminCabins();
  return <><p className="eyebrow">ALOJAMIENTOS</p><h1>Tus cabañas</h1>
    <StatusMessage saved={(await searchParams).saved === "1"}/>
    <Link className="button" href="/admin/cabanas/nueva">Crear cabaña</Link>
    {!cabins.length && <p className="admin-panel">Todavía no hay cabañas. Crea la primera o carga los datos de demostración para desarrollo.</p>}
    <div className="admin-cabins">{cabins.map(c => <article className="admin-panel" key={c.id}>
      <div className="admin-cabin"><img src={c.images[0]?.url ?? "/images/logo.svg"} alt={c.images[0]?.alt ?? c.name} width="240" height="180"/>
        <div><h2>{c.name}</h2><p>{c.capacity} personas · {c.mode === "NIGHTLY" ? "Por noche" : "Por hora"} · {money(c.baseRateClp)}</p>
          <p className="badge">{c.publicationStatus === "PUBLISHED" ? "Publicada" : c.publicationStatus === "ARCHIVED" ? "Archivada" : "Borrador"}</p>
          <p>{c.seasonalRates.length} tarifas de temporada</p><Link className="button secondary" href={`/admin/cabanas/${c.id}`}>Editar cabaña y tarifas</Link>
          {c.publicationStatus === "PUBLISHED" && <p><Link href={`/cabanas/${c.slug}`}>Ver ficha pública ↗</Link></p>}
        </div></div>
      <div className="management-buttons">
        <ActionForm action={publicationAction} label={c.publicationStatus === "PUBLISHED" ? "Despublicar" : "Publicar"} kind="publication">
          <input type="hidden" name="id" value={c.id}/><input type="hidden" name="published" value={c.publicationStatus === "PUBLISHED" ? "no" : "yes"}/>
        </ActionForm>
        <ActionForm action={deleteCabinAction} label="Eliminar cabaña" kind="delete-cabin">
          <input type="hidden" name="id" value={c.id}/><label className="delete-check"><input type="checkbox" name="confirmDelete" value="yes" required/> Confirmo eliminar esta cabaña</label>
        </ActionForm>
      </div></article>)}</div></>;
}