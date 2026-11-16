"use client";
import { useState } from "react";
import type { Cabin } from "@/modules/cabins/data";
import { CabinCard } from "@/components/cabin-card";
export function Catalog({ cabins }: { cabins: Cabin[] }) { const [filter, setFilter] = useState("all"); const filtered = cabins.filter(c => filter === "all" || c.mode === filter); return <><div className="filter-bar"><div className="filters" aria-label="Filtrar por modalidad">{[["all", "Todas"], ["night", "Por noche"], ["hour", "Por hora"]].map(([value,label]) => <button key={value} onClick={() => setFilter(value)} aria-pressed={filter === value}>{label}</button>)}</div><span className="muted" aria-live="polite">{filtered.length} cabañas</span></div>{!filtered.length && <p>No hay cabañas publicadas para esta modalidad.</p>}<div className="cabin-grid">{filtered.map(c => <CabinCard key={c.slug} cabin={c}/>)}</div></>; }
