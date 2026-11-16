import { requireAdmin } from "@/lib/require-admin";
import { logout } from "./actions";
import Link from "next/link";
import { getBusiness } from "@/lib/public-data";
import { AdminNav } from "@/components/admin-nav";
export const metadata = { title: "Administración", robots: { index: false, follow: false } };
export default async function AdminLayout({children}: {children: React.ReactNode}) {
 await requireAdmin(); const business = await getBusiness();
 return <div className="admin-shell"><aside className="admin-sidebar"><Link href="/" className="brand">{business.logo && <img src={business.logo} alt="" width="34" height="34"/>}{business.name}</Link><p className="eyebrow">ADMINISTRACIÓN</p><AdminNav/><Link className="back-link" href="/">← Ver sitio público</Link></aside><div className="admin-main"><header className="admin-top"><span>Tu espacio de gestión</span><form action={logout}><button className="button secondary">Cerrar sesión</button></form><span className="badge">Administración</span></header><main id="contenido">{children}</main><p className="admin-disclaimer">Catálogo y configuración conectados a PostgreSQL. Solicitudes sujetas a aceptación del dueño.</p></div></div>;
}