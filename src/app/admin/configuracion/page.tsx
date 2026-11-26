import { requireAdmin } from "@/lib/require-admin";
import { getAdminSettings } from "@/lib/admin-data";
import { SettingsEditor } from "@/components/settings-editor";
import { StatusMessage } from "@/components/admin-fields";
export default async function Settings({ searchParams }: {searchParams: Promise<{saved?: string}>}) {
 await requireAdmin(); const settings = await getAdminSettings();
 return <><p className="eyebrow">TU NEGOCIO</p><h1>Configuración</h1><p className="intro">Los cambios se guardan en PostgreSQL y se muestran en el sitio público. El correo público, el correo para avisos y el correo de acceso son independientes. El número de WhatsApp es opcional y solo habilita un enlace en las cabañas.</p><StatusMessage saved={(await searchParams).saved === "1"}/><SettingsEditor settings={settings}/></>;
}