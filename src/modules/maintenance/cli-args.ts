import { parseArgs } from "node:util";
import { DEFAULT_BATCH_SIZE, MAX_BATCH_SIZE } from "./cleanup";

export type CleanupArgs = { apply: boolean; batchSize: number; help: boolean };

export function parseCleanupArgs(argv: string[]): CleanupArgs {
  const { values } = parseArgs({
    args: argv,
    allowPositionals: false,
    strict: true,
    options: {
      apply: { type: "boolean", default: false },
      "batch-size": { type: "string" },
      help: { type: "boolean", default: false },
    },
  });
  let batchSize = DEFAULT_BATCH_SIZE;
  const raw = values["batch-size"];
  if (raw !== undefined) {
    if (!/^\d+$/.test(raw)) throw new Error("--batch-size debe ser un entero positivo.");
    batchSize = Number(raw);
    if (batchSize < 1 || batchSize > MAX_BATCH_SIZE) throw new Error(`--batch-size debe estar entre 1 y ${MAX_BATCH_SIZE}.`);
  }
  return { apply: Boolean(values.apply), batchSize, help: Boolean(values.help) };
}

export const CLEANUP_USAGE = `Uso: npm run maintenance:cleanup -- [--apply] [--batch-size=<n>]

  (sin opciones)     Modo simulación: cuenta las filas que se borrarían, sin borrar nada.
  --apply            Borra las filas vencidas, en lotes.
  --batch-size=<n>   Filas por lote, entre 1 y ${MAX_BATCH_SIZE} (por defecto ${DEFAULT_BATCH_SIZE}).
  --help             Muestra esta ayuda.`;
