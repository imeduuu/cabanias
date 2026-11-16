import { requireAdmin } from "@/lib/require-admin";
import { listAdminCabins, getAdminRequestCounts } from "@/lib/admin-data";
import Link from "next/link";
export default async function Dashboard() {
 await requireAdmin(); const [cabins,counts] = await Promise.all([listAdminCabins(),getAdminRequestCounts()]);
 return <><p className="eyebrow">VISTA GENERAL</p><h1>Bienvenido a tu refugio.</h1><p className="intro">Administra el catálogo y las solicitudes de tu negocio.</p>
 <div className="stats dashboard-stats"><div><span>Cabañas</span><strong>{cabins.length}</strong><small>{cabins.filter(c=>c.publicationStatus === "PUBLISHED").length} publicadas</small></div><div><Link href="/admin/solicitudes?status=PENDING"><span>Solicitudes pendientes</span><strong data-count="pending">{counts.pending}</strong><small>Esperan revisión</small></Link></div><div><Link href="/admin/solicitudes?status=CONFIRMED"><span>Reservas confirmadas</span><strong data-count="confirmed">{counts.confirmed}</strong><small>Ocupan su período</small></Link></div></div>
 <section className="admin-panel"><h2>Todo en su lugar</h2><div className="quick-links"><Link href="/admin/cabanas"><h3>Cabañas y tarifas ↗</h3><p>Gestiona fichas, imágenes, servicios y temporadas.</p></Link><Link href="/admin/configuracion"><h3>La identidad de tu negocio ↗</h3><p>Edita textos, contacto, colores, horarios y políticas.</p></Link></div></section>
 <section className="admin-panel"><h2>Gestiona las solicitudes</h2><p>Confirmar vuelve a comprobar disponibilidad. Las pendientes no bloquean el período.</p><Link className="button" href="/admin/solicitudes">Revisar solicitudes</Link></section></>;
}