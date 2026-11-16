import Link from "next/link";
import type { ReactNode } from "react";
export function ButtonLink({ href, children, secondary = false }: { href: string; children: ReactNode; secondary?: boolean }) { return <Link className={`button ${secondary ? "secondary" : ""}`} href={href}>{children}</Link>; }
export function SectionHeading({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) { return <div className="section-heading">{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h2>{title}</h2>{children && <p>{children}</p>}</div>; }
export function DemoNotice() { return <div className="notice"><span aria-hidden="true">◌</span> Vista de ejemplo · sin reservas ni cambios persistentes</div>; }
