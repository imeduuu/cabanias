import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { getBusiness } from "@/lib/public-data";
import { getSiteUrl } from "@/config/site";
import "./globals.css";
export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
 const business = await getBusiness();
 return { metadataBase: getSiteUrl(), title: { default: business.name, template: `%s | ${business.name}` }, description: business.description,
  openGraph: { type: "website", locale: "es_CL", siteName: business.name, title: business.name, description: business.description, url: getSiteUrl() } };
}
export default async function RootLayout({ children }: Readonly<{children: React.ReactNode}>) {
 const business = await getBusiness();
 return <html lang="es"><body style={{ "--primary": business.colors.primary, "--accent": business.colors.accent, "--paper": business.colors.background } as CSSProperties}><a href="#contenido" className="skip-link">Saltar al contenido</a>{children}</body></html>;
}
