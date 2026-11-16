import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { getBusiness } from "@/lib/public-data";
import "./globals.css";
export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
 const business = await getBusiness();
 return { title: { default: business.name, template: `%s | ${business.name}` }, description: business.description };
}
export default async function RootLayout({ children }: Readonly<{children: React.ReactNode}>) {
 const business = await getBusiness();
 return <html lang="es"><body style={{ "--primary": business.colors.primary, "--accent": business.colors.accent, "--paper": business.colors.background } as CSSProperties}><a href="#contenido" className="skip-link">Saltar al contenido</a>{children}</body></html>;
}