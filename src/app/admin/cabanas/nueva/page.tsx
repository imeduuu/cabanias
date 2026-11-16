import { requireAdmin } from "@/lib/require-admin";
import { CabinEditor } from "@/components/cabin-editor";
import Link from "next/link";
export default async function NewCabin() { await requireAdmin(); return <><Link className="back-link" href="/admin/cabanas">← Cabañas</Link><h1>Nueva cabaña</h1><CabinEditor/></>; }
