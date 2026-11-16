import { requireAdmin } from "@/lib/require-admin";
import { getAdminCabin } from "@/lib/admin-data";
import { CabinEditor, SeasonEditor } from "@/components/cabin-editor";
import { StatusMessage } from "@/components/admin-fields";
import { notFound } from "next/navigation";
import Link from "next/link";
export default async function EditCabin({ params, searchParams }: { params: Promise<{id: string}>; searchParams: Promise<{saved?: string}> }) {
  await requireAdmin();
  const cabin = await getAdminCabin((await params).id); if (!cabin) notFound();
  return <><Link className="back-link" href="/admin/cabanas">← Cabañas</Link><h1>{cabin.name}</h1><StatusMessage saved={(await searchParams).saved === "1"}/><CabinEditor cabin={cabin}/><SeasonEditor cabin={cabin}/></>;
}
