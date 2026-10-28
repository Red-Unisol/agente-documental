import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { leerEntorno } from "../configuracion/entorno.js";
import { armarCorrida, type CasoCorrido, type Corrida, registrarCaso } from "../evals/corrida.js";
import { esquemaDeEsperado, graduar } from "../evals/graduar.js";
import { iniciarSimulacion } from "./simulacion.js";
import { transcripcionEnMarkdown } from "./transcripcion.js";

const CARPETA_DE_CASOS = "evals/conversaciones";
const CARPETA_DE_CORRIDAS = "evals/corridas";

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

async function main(): Promise<void> {
  const argumentos = new Map(process.argv.slice(2).map((arg, i, todos) => [arg, todos[i + 1] ?? ""]));
  const filtro = argumentos.get("--solo");
  const archivos = (await readdir(CARPETA_DE_CASOS))
    .filter((a) => a.endsWith(".json") && (!filtro || a.includes(filtro)))
    .sort();

  const casos: CasoCorrido[] = [];
  for (const archivo of archivos) casos.push(await correr(archivo));

  const entorno = leerEntorno();
  const corrida = armarCorrida({ conversacion: entorno.OPENAI_MODELO_CONVERSACION, lectura: entorno.OPENAI_MODELO_LECTURA }, casos);
  console.log(`\n${corrida.total.pasaron}/${corrida.total.casos} evals pasaron · ${costo(corrida.total.costoUsd)} · ${corrida.modelos.conversacion} + ${corrida.modelos.lectura}`);

  if (argumentos.has("--guardar")) await guardar(corrida);
  const salida = argumentos.get("--salida");
  if (salida) await writeFile(salida, informe(corrida));
  process.exit(corrida.total.pasaron === corrida.total.casos ? 0 : 1);
}

async function correr(archivo: string): Promise<CasoCorrido> {
  const evaluacion = esquemaDeEval.parse(JSON.parse(await readFile(join(CARPETA_DE_CASOS, archivo), "utf8")));
  const simulacion = await iniciarSimulacion(evaluacion.ficha, evaluacion.hoy ? new Date(`${evaluacion.hoy}T12:00:00`) : undefined);
  for (const turno of evaluacion.turnos) await simulacion.enviar(turno.texto, turno.archivo);

  const conversacion = await simulacion.conversacion();
  const caso = registrarCaso(archivo, evaluacion.nombre, conversacion, simulacion.crm.acciones, graduar(conversacion, evaluacion.esperado));
  console.log(`${caso.paso ? "PASA " : "FALLA"}  ${caso.nombre}  (${costo(caso.uso.costoUsd)}, ${(caso.uso.milisegundos / 1000).toFixed(1)} s)`);
  for (const criterio of caso.criterios.filter((c) => !c.ok)) console.log(`       ✗ ${criterio.nombre}: ${criterio.detalle}`);
  return caso;
}

async function guardar(corrida: Corrida): Promise<void> {
  await mkdir(CARPETA_DE_CORRIDAS, { recursive: true });
  const ruta = join(CARPETA_DE_CORRIDAS, `${corrida.id}.json`);
  await writeFile(ruta, JSON.stringify(corrida, null, 2));
  console.log(`Corrida guardada en ${ruta}`);
}

function informe(corrida: Corrida): string {
  const filas = corrida.casos.map(
    (c) => `| ${c.nombre} | ${c.paso ? "✓" : "✗"} | ${costo(c.uso.costoUsd)} | ${(c.uso.milisegundos / 1000).toFixed(1)} s | ${c.criterios.map((k) => `${k.ok ? "✓" : "✗"} ${k.nombre}`).join(" · ")} |`,
  );
  return [
    "# Evals de conversación",
    "",
    `Modelos: ${corrida.modelos.conversacion} (conversación) · ${corrida.modelos.lectura} (lectura) · Total: ${costo(corrida.total.costoUsd)}`,
    "",
    "| Caso | Resultado | Costo | Tiempo en modelo | Criterios |",
    "|---|---|---|---|---|",
    ...filas,
    "",
    ...corrida.casos.flatMap((c) => ["---", "", transcripcionDe(c), ""]),
  ].join("\n");
}

function transcripcionDe(caso: CasoCorrido): string {
  const conversacion = { id: caso.archivo, chatId: "", ficha: caso.ficha, estado: caso.estadoFinal, mensajes: caso.mensajes, archivos: [], auditoria: caso.auditoria };
  return transcripcionEnMarkdown(caso.nombre, conversacion, caso.acciones).replace(/^# /, "## ");
}

function costo(usd: number | undefined): string {
  return usd === undefined ? "sin tarifa" : `US$ ${usd.toFixed(4)}`;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
