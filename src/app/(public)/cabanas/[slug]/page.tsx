import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublishedCabin, getBusiness } from "@/lib/public-data";
import { money, modeLabel } from "@/lib/format";
import { BookingForm } from "@/components/booking-form";
import { randomUUID } from "node:crypto";
export default async function CabinPage({params}: {params: Promise<{slug: string}>}) {
 const {slug} = await params;
 const [cabin, business] = await Promise.all([getPublishedCabin(slug), getBusiness()]);
 if (!cabin) notFound();
 return <main id="contenido" className="container section"><Link className="back-link" href="/cabanas">← Todas las cabañas</Link><p className="eyebrow">{business.location}</p><h1>{cabin.name}</h1><p className="intro">Hasta {cabin.guests} personas · {cabin.beds} dormitorios · Arriendo por {modeLabel(cabin.mode)}</p>
 <img className="detail-image" src={cabin.image} alt={cabin.gallery[0]?.alt ?? cabin.name} width="1200" height="650"/>
 {cabin.gallery.length > 1 && <div className="gallery-grid">{cabin.gallery.slice(1).map((image, i) => <img key={i} src={image.url} alt={image.alt} width="600" height="400"/>)}</div>}
 <div className="detail-grid"><div><h2>Un espacio para desconectar</h2><p className="preserve-lines">{cabin.description}</p><h3>Todo lo necesario</h3><ul className="amenities">{cabin.amenities.map(a => <li key={a}>✓ {a}</li>)}</ul>
 {cabin.mode === "night" && <p>Entrada desde las {business.checkInHour}:00 · Salida hasta las {business.checkOutHour}:00 · {business.timezone}</p>}
 <h3>Política de cancelación</h3><p className="preserve-lines">{business.cancellationPolicy}</p></div>
 <aside className="price-panel"><span className="eyebrow">TARIFA BASE</span><p className="price">{money(cabin.price)} <small>/ {modeLabel(cabin.mode)}</small></p>
 {cabin.seasons.length > 0 && <><h3>Temporadas</h3><ul className="season-prices">{cabin.seasons.map((season, i) => <li key={i}><strong>{season.name}</strong><span>{season.startDate} al {season.endDate} (fin excluido)</span><span>{money(season.rateClp)} / {modeLabel(cabin.mode)}</span></li>)}</ul><p className="muted">Las tarifas de temporada sustituyen la tarifa base. Fechas locales de Santiago.</p></>}
 <BookingForm slug={cabin.slug} mode={cabin.mode} capacity={cabin.guests} submissionKey={randomUUID()} cabinName={cabin.name} whatsappNumber={business.whatsappNumber}/><small>Moneda {business.currency} · {business.timezone}</small></aside></div></main>;
}
