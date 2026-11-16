"use client";
export default function GlobalError({ reset }: { reset: () => void }) {
  return <html lang="es"><body><main><h1>No pudimos cargar el sitio.</h1><p>Comprueba la conexión de PostgreSQL e inténtalo nuevamente.</p><button onClick={reset}>Reintentar</button></main></body></html>;
}
