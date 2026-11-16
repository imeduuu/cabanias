"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main id="contenido" className="container section"><h1>No pudimos cargar esta página.</h1><p>Comprueba que PostgreSQL esté iniciado e inténtalo nuevamente.</p><button className="button" onClick={reset}>Reintentar</button></main>;
}
