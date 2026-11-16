"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
const links = [["/admin", "◇", "Resumen"], ["/admin/cabanas", "◇", "Cabañas"], ["/admin/solicitudes", "◇", "Solicitudes"], ["/admin/calendario", "◇", "Calendario"], ["/admin/configuracion", "◇", "Configuración"]];
export function AdminNav() { const path = usePathname(); return <nav className="admin-nav" aria-label="Administración">{links.map(([href, icon, label]) => <Link key={href} href={href} aria-current={path === href ? "page" : undefined}><span aria-hidden="true">{icon}</span>{label}</Link>)}</nav>; }
