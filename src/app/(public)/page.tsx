import { getBusiness, getPublishedCabins } from "@/lib/public-data";
import { ButtonLink, SectionHeading } from "@/components/ui";
import { CabinCard } from "@/components/cabin-card";
import { getSiteUrl } from "@/config/site";
export default async function Home() {
 const [business, cabins] = await Promise.all([getBusiness(), getPublishedCabins()]);
 if (!business.configured) return <main id="contenido" className="container section"><h1>Sitio en preparación</h1><p>El negocio todavía no ha configurado su información pública.</p></main>;
 const jsonLd = { "@context": "https://schema.org", "@type": "LodgingBusiness", name: business.name, description: business.description, url: getSiteUrl().toString(), ...(business.location ? { address: { "@type": "PostalAddress", description: business.location } } : {}), ...(business.logo ? { image: new URL(business.logo, getSiteUrl()).toString() } : {}) };
 return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replaceAll("<", "\\u003c") }}/><main id="contenido"><section className="hero container"><div className="hero-copy"><p className="eyebrow">{business.home.eyebrow}</p><h1>{business.tagline}</h1><p>{business.description}</p><ButtonLink href="/cabanas">Descubre las cabañas <span>↗</span></ButtonLink><div className="hero-note"><span>↟</span><p>Tu próxima pausa empieza aquí.<small>{business.location}</small></p></div></div><div className="hero-art">{cabins[0] ? <img src={cabins[0].image} alt={cabins[0].name} width="800" height="600"/> : <div className="empty-state"><p>Pronto podrás conocer nuestras cabañas.</p></div>}<div className="art-caption">ESPACIO PARA RESPIRAR</div></div></section>
 <div className="benefits container"><span>↟ Rodeadas de naturaleza</span><span>⌂ Espacios con identidad</span><span>◷ Por noche o por hora</span></div>
 <section className="container section"><div className="heading-row"><SectionHeading eyebrow="ELIGE TU ESCAPADA" title={business.home.catalogTitle}>{business.home.catalogDescription}</SectionHeading><ButtonLink href="/cabanas" secondary>Ver todas ↗</ButtonLink></div>{!cabins.length && <p>Estamos preparando nuestro catálogo.</p>}<div className="cabin-grid">{cabins.slice(0, 3).map(c => <CabinCard key={c.slug} cabin={c}/>)}</div></section>
 <section className="story container"><div className="story-mark" aria-hidden="true">↟</div><div><p className="eyebrow">EL ARTE DE HACER UNA PAUSA</p><h2>{business.home.storyTitle}</h2><p>{business.home.storyBody}</p></div></section></main></>;
}
