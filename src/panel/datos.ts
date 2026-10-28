import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Corrida } from "../evals/corrida.js";

const CARPETA_DE_CORRIDAS = "evals/corridas";

export async function leerCorridas(): Promise<Corrida[]> {
  const archivos = (await readdir(CARPETA_DE_CORRIDAS).catch(() => [] as string[])).filter((a) => a.endsWith(".json")).sort();
  const corridas = await Promise.all(archivos.map(async (archivo) => JSON.parse(await readFile(join(CARPETA_DE_CORRIDAS, archivo), "utf8")) as Corrida));
  return corridas.sort((a, b) => b.fecha.localeCompare(a.fecha));
}
