import Link from "next/link";
import type { Cabin } from "@/modules/cabins/data";
import { money, modeLabel } from "@/lib/format";
export function CabinCard({ cabin, headingLevel = "h3" }: { cabin: Cabin; headingLevel?: "h2" | "h3" }) {
  const Heading = headingLevel;
  return <article className="cabin-card"><Link href={`/cabanas/${cabin.slug}`} className="card-image"><img src={cabin.image} alt={cabin.imageAlt ?? `Ilustración de ${cabin.name}`} width="800" height="600"/><span className="badge">Por {modeLabel(cabin.mode)}</span></Link><div className="card-body"><p className="muted">Hasta {cabin.guests} personas · {cabin.beds} dormitorios</p><Heading><Link href={`/cabanas/${cabin.slug}`}>{cabin.name}</Link></Heading><p>{cabin.subtitle}</p><div className="card-bottom"><span><strong>{money(cabin.price)}</strong> / {modeLabel(cabin.mode)}</span><Link href={`/cabanas/${cabin.slug}`} aria-label={`Explorar ↗ ${cabin.name}`}>Explorar ↗</Link></div></div></article>;
}
