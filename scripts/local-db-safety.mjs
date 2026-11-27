export function assertLocalUrl(value, kind) {
  const expected = kind === "test"
    ? { port: "54330", database: "cabanias_test" }
    : { port: "54329", database: "cabanias_dev" };
  let url;
  try { url = new URL(value); } catch { throw new Error("Falta una conexión PostgreSQL local válida."); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || url.hostname !== "127.0.0.1" ||
      url.port !== expected.port || url.pathname !== `/${expected.database}` ||
      url.username !== "cabanias_local" || !url.password ||
      [...url.searchParams.keys()].some(key => key !== "schema") ||
      (url.searchParams.has("schema") && url.searchParams.get("schema") !== "public")) {
    throw new Error(`Destino rechazado: solo 127.0.0.1:${expected.port}/${expected.database}, usuario cabanias_local, esquema public.`);
  }
  return expected;
}

export function assertProductionUrl(value) {
  if (process.env.NODE_ENV !== "production" || process.env.CABANIAS_ALLOW_PRODUCTION_DATABASE !== "1") {
    throw new Error("La base remota requiere NODE_ENV=production y CABANIAS_ALLOW_PRODUCTION_DATABASE=1.");
  }
  let url;
  try { url = new URL(value); } catch { throw new Error("Falta una conexión PostgreSQL válida."); }
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || !url.username || !url.password ||
      ["localhost", "127.0.0.1", "::1"].includes(url.hostname) || ["cabanias_dev", "cabanias_test"].includes(database) ||
      [...url.searchParams.keys()].some(key => !["schema", "sslmode"].includes(key)) ||
      (url.searchParams.has("schema") && url.searchParams.get("schema") !== "public")) {
    throw new Error("Destino rechazado: se requiere una base PostgreSQL remota distinta de las bases locales de desarrollo y prueba.");
  }
  return { database, username: decodeURIComponent(url.username), host: url.hostname };
}
