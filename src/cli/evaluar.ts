import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { type Criterio, esquemaDeEsperado, graduar } from "../evals/graduar.js";
import { iniciarSimulacion } from "./simulacion.js";
import { transcripcionEnMarkdown } from "./transcripcion.js";

const CARPETA = "evals/conversaciones";

const esquemaDeEval = z.object({
  nombre: z.string(),
  hoy: z.string().optional(),
  ficha: z.object({
    negociacionId: z.string(),
    nombre: z.string(),
    dni: z.string(),
    provincia: z.string(),
    convenio: z.string(),
    sectorDeclarado: z.enum(["publico", "privado"]),
    empleadorDeclarado: z.string(),
  }),
  turnos: z.array(z.object({ texto: z.string(), archivo: z.string().optional() })),
  esperado: esquemaDeEsperado,
});

interface ResultadoDeEval {
  archivo: string;
  nombre: string;
  criterios: Criterio[];
  transcripcion: string;
}

async function main(): Promise<void> {
  const salida = process.argv.indexOf("--salida") >= 0 ? process.argv[process.argv.indexOf("--salida") + 1] : undefined;
  const archivos = (await readdir(CARPETA)).filter((a) => a.endsWith(".json")).sort();
  const resultados: ResultadoDeEval[] = [];
  for (const archivo of archivos) resultados.push(await correr(archivo));

  const fallidos = resultados.filter((r) => r.criterios.some((c) => !c.ok));
  console.log(`\n${resultados.length - fallidos.length}/${resultados.length} evals pasaron.`);
  if (salida) await writeFile(salida, informe(resultados));
  process.exit(fallidos.length ? 1 : 0);
}

async function correr(archivo: string): Promise<ResultadoDeEval> {
  const evaluacion = esquemaDeEval.parse(JSON.parse(await readFile(join(CARPETA, archivo), "utf8")));
  const simulacion = await iniciarSimulacion(evaluacion.ficha, evaluacion.hoy ? new Date(`${evaluacion.hoy}T12:00:00`) : undefined);
  for (const turno of evaluacion.turnos) await simulacion.enviar(turno.texto, turno.archivo);

  const conversacion = await simulacion.conversacion();
  const criterios = graduar(conversacion, evaluacion.esperado);
  const estado = criterios.every((c) => c.ok) ? "PASA" : "FALLA";
  console.log(`${estado}  ${evaluacion.nombre}`);
  for (const criterio of criterios.filter((c) => !c.ok)) console.log(`       ✗ ${criterio.nombre}: ${criterio.detalle}`);

  return { archivo, nombre: evaluacion.nombre, criterios, transcripcion: transcripcionEnMarkdown(evaluacion.nombre, conversacion, simulacion.crm.acciones) };
}

function informe(resultados: ResultadoDeEval[]): string {
  const resumen = resultados.map((r) => `| ${r.nombre} | ${r.criterios.every((c) => c.ok) ? "✓" : "✗"} | ${r.criterios.map((c) => `${c.ok ? "✓" : "✗"} ${c.nombre}`).join(" · ")} |`);
  return [
    "# Evals de conversación",
    "",
    "| Caso | Resultado | Criterios |",
    "|---|---|---|",
    ...resumen,
    "",
    ...resultados.flatMap((r) => ["---", "", r.transcripcion.replace(/^# /, "## "), ""]),
  ].join("\n");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
