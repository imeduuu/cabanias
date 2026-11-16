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
