import { Catalog } from "@/components/catalog";
import { getBusiness, getPublishedCabins } from "@/lib/public-data";
export const metadata = { title: "Nuestras cabañas" };
export default async function CabinsPage() {
 const [business, cabins] = await Promise.all([getBusiness(), getPublishedCabins()]);
 return <main id="contenido" className="container section"><p className="eyebrow">CADA ESCAPADA TIENE SU LUGAR</p><h1>{business.home.catalogTitle}</h1><p className="intro">{business.home.catalogDescription} Cada cabaña tiene una única modalidad de arriendo.</p><Catalog cabins={cabins}/></main>;
}