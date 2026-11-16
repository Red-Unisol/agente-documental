import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { crearClienteOpenAI } from "../adaptadores/openai/cliente.js";
import { LectorDeReciboOpenAI } from "../adaptadores/openai/lector-de-recibo.js";
import { configuracionInicial } from "../aplicacion/configuracion-inicial.js";
import { type RevisionDeArchivo, revisarArchivo } from "../aplicacion/revisar-archivo.js";
import { leerEntorno } from "../configuracion/entorno.js";
import type { Archivo } from "../dominio/conversacion/conversacion.js";
import { tarifasOpenAI } from "../dominio/costos/tarifas.js";
import { costoEnUsd, type UsoDelModelo } from "../dominio/costos/uso.js";
import type { Ficha, LecturaDeDocumento, Reglas } from "../dominio/tipos.js";
import { liquidacionAVerificar } from "../dominio/verificacion/liquidacion.js";
import { verificarRecibo } from "../dominio/verificacion/verificar.js";
import { type CasoDeLectura, esquemaDeCasoDeLectura, graduarLectura, informeDeLecturas, type ResultadoDeLectura } from "../evals/lecturas.js";

// Eval de la lectura de recibos, sin conversación: por cada archivo del manifiesto corre el lector y
// las verificaciones, y compara con lo esperado. Pensado para documentos reales, así que el manifiesto
// y la carpeta de salida van fuera del repositorio; el informe sólo tiene agregados.
//
//   npm run evals:lecturas -- --manifiesto <casos.jsonl> --salida <carpeta> [--limite 40] [--solo texto] [--concurrencia 6]
//   npm run evals:lecturas -- --manifiesto <casos.jsonl> --salida <carpeta> --regraduar
//
// --regraduar no llama al modelo: toma las lecturas ya guardadas en la carpeta y las vuelve a verificar
// con el código y las reglas de ahora. Sirve para probar un cambio en las verificaciones sin gastar.

interface Lectores {
  lector: LectorDeReciboOpenAI;
  lectorDeRespaldo?: LectorDeReciboOpenAI;
}

const TIPOS_MIME: Record<string, string> = { ".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

async function main(): Promise<void> {
  const argumentos = new Map(process.argv.slice(2).map((arg, i, todos) => [arg, todos[i + 1] ?? ""]));
  const manifiesto = argumentos.get("--manifiesto");
  const salida = argumentos.get("--salida");
  if (!manifiesto || !salida) throw new Error("Uso: npm run evals:lecturas -- --manifiesto <casos.jsonl> --salida <carpeta>");

  if (process.argv.includes("--regraduar")) return regraduar(manifiesto, salida);

  const entorno = leerEntorno();
  const cliente = crearClienteOpenAI(entorno.OPENAI_API_KEY);
  const respaldo = entorno.OPENAI_MODELO_LECTURA_RESPALDO;
  const lectores: Lectores = { lector: new LectorDeReciboOpenAI(cliente, entorno.OPENAI_MODELO_LECTURA), ...(respaldo && { lectorDeRespaldo: new LectorDeReciboOpenAI(cliente, respaldo) }) };
  const modelos = respaldo ? `${entorno.OPENAI_MODELO_LECTURA}, con segunda lectura de ${respaldo}` : entorno.OPENAI_MODELO_LECTURA;
  const { reglas } = configuracionInicial;
  const casos = elegir(await leerManifiesto(manifiesto), argumentos);

  await mkdir(salida, { recursive: true });
  const detalle = join(salida, "detalle.jsonl");
  const yaCorridos = await resultadosPrevios(detalle);
  const pendientes = casos.filter((caso) => !yaCorridos.has(caso.id));
  console.log(`${casos.length} casos · ${yaCorridos.size} ya corridos · ${pendientes.length} por correr · lectura con ${modelos}`);

  const resultados = [...yaCorridos.values()].filter((r) => casos.some((caso) => caso.id === r.id));
  await enParalelo(pendientes, Number(argumentos.get("--concurrencia") || 6), async (caso) => {
    const corrido = await correr(caso, lectores, reglas).catch((error: unknown) => fallaDeEjecucion(caso, error, entorno.OPENAI_MODELO_LECTURA));
    resultados.push(corrido.resultado);
    await appendFile(detalle, `${JSON.stringify(corrido)}\n`);
    const fallas = corrido.resultado.criterios.filter((c) => !c.ok).map((c) => `${c.nombre}: ${c.detalle}`).join(" · ");
    console.log(`${corrido.resultado.paso ? "PASA " : "FALLA"}  ${caso.id}  ${fallas}`);
  });

  await writeFile(join(salida, "informe.md"), informeDeLecturas(resultados, modelos));
  const pasaron = resultados.filter((r) => r.paso).length;
  console.log(`\n${pasaron}/${resultados.length} documentos pasaron · informe en ${join(salida, "informe.md")}`);
}

async function regraduar(manifiesto: string, salida: string): Promise<void> {
  const casos = new Map((await leerManifiesto(manifiesto)).map((caso) => [caso.id, caso]));
  const lineas = (await readFile(join(salida, "detalle.jsonl"), "utf8")).split("\n").filter((linea) => linea.trim());
  const resultados: ResultadoDeLectura[] = [];
  for (const linea of lineas) {
    const previo = JSON.parse(linea) as { resultado: ResultadoDeLectura; lectura?: LecturaDeDocumento };
    const caso = casos.get(previo.resultado.id);
    if (!caso || !previo.lectura) continue;
    const { lectura } = previo;
    const resultado = graduar(caso, { lectura, ...verificar(caso, lectura) }, previo.resultado);
    resultados.push(resultado);
    const fallas = resultado.criterios.filter((c) => !c.ok).map((c) => `${c.nombre}: ${c.detalle}`).join(" · ");
    if (!resultado.paso) console.log(`FALLA  ${caso.id}  ${fallas}`);
  }
  const modelos = [...new Set(resultados.map((r) => r.uso.modelo))].join(", ");
  await writeFile(join(salida, "informe.md"), informeDeLecturas(resultados, modelos));
  console.log(`\n${resultados.filter((r) => r.paso).length}/${resultados.length} documentos pasaron con las verificaciones de ahora · informe en ${join(salida, "informe.md")}`);
}

function fichaDe(caso: CasoDeLectura): Ficha {
  const { empleadorDeclarado, situacionDeclarada, ...ficha } = caso.ficha;
  return { ...ficha, ...(empleadorDeclarado && { empleadorDeclarado }), ...(situacionDeclarada && { situacionDeclarada }) };
}

function verificar(caso: CasoDeLectura, lectura: LecturaDeDocumento) {
  const { reglas } = configuracionInicial;
  const hoy = new Date(`${caso.hoy}T12:00:00`);
  return { liquidacion: liquidacionAVerificar(lectura, hoy, reglas.diaDeGracia), verificacion: verificarRecibo({ lectura, ficha: fichaDe(caso), reglas, hoy }) };
}

function graduar(caso: CasoDeLectura, revision: Pick<RevisionDeArchivo, "lectura" | "liquidacion" | "verificacion">, medido: Pick<ResultadoDeLectura, "uso" | "costoUsd" | "conSegundaLectura">): ResultadoDeLectura {
  const criterios = graduarLectura(caso, { esRecibo: revision.liquidacion !== undefined, periodo: revision.liquidacion?.periodo, verificacion: revision.verificacion });
  return { id: caso.id, grupo: caso.grupo, rasgos: caso.rasgos, paso: criterios.every((c) => c.ok), criterios, decision: revision.verificacion.decision, uso: medido.uso, costoUsd: medido.costoUsd, conSegundaLectura: medido.conSegundaLectura ?? false };
}

async function correr(caso: CasoDeLectura, lectores: Lectores, reglas: Reglas) {
  const revision = await revisarArchivo(await cargarArchivo(caso.archivo), { ...lectores, ficha: fichaDe(caso), reglas, hoy: new Date(`${caso.hoy}T12:00:00`) });
  const costos = revision.usos.map((uso) => costoEnUsd(uso, tarifasOpenAI));
  const costoUsd = costos.every((c) => c !== undefined) ? costos.reduce((total: number, c) => total + (c ?? 0), 0) : undefined;
  const resultado = graduar(caso, revision, { uso: usoTotal(revision.usos), costoUsd, conSegundaLectura: revision.conSegundaLectura });
  return { resultado, lectura: revision.lectura, motivos: revision.verificacion.motivos };
}

function usoTotal(usos: UsoDelModelo[]): UsoDelModelo {
  const suma = (campo: "tokensDeEntrada" | "tokensCacheados" | "tokensDeSalida" | "milisegundos") => usos.reduce((total, uso) => total + uso[campo], 0);
  return { modelo: usos.map((uso) => uso.modelo).join(" + "), tokensDeEntrada: suma("tokensDeEntrada"), tokensCacheados: suma("tokensCacheados"), tokensDeSalida: suma("tokensDeSalida"), milisegundos: suma("milisegundos") };
}

function fallaDeEjecucion(caso: CasoDeLectura, error: unknown, modelo: string) {
  const detalle = error instanceof Error ? error.message : String(error);
  const resultado: ResultadoDeLectura = {
    id: caso.id,
    grupo: caso.grupo,
    rasgos: caso.rasgos,
    paso: false,
    criterios: [{ nombre: "ejecucion", ok: false, detalle: detalle.slice(0, 200) }],
    decision: "pedir_de_nuevo",
    uso: { modelo, tokensDeEntrada: 0, tokensCacheados: 0, tokensDeSalida: 0, milisegundos: 0 },
    costoUsd: 0,
    conSegundaLectura: false,
  };
  return { resultado, lectura: undefined, motivos: [detalle] };
}

async function leerManifiesto(ruta: string): Promise<CasoDeLectura[]> {
  const lineas = (await readFile(ruta, "utf8")).split("\n").filter((linea) => linea.trim());
  return lineas.map((linea) => esquemaDeCasoDeLectura.parse(JSON.parse(linea)));
}

// --solo filtra por id; --limite toma una muestra pareja entre grupos (siempre la misma para el mismo manifiesto).
function elegir(casos: CasoDeLectura[], argumentos: Map<string, string>): CasoDeLectura[] {
  const filtro = argumentos.get("--solo");
  const filtrados = filtro ? casos.filter((caso) => caso.id.includes(filtro)) : casos;
  const limite = Number(argumentos.get("--limite") || 0);
  if (!limite || limite >= filtrados.length) return filtrados;

  const porGrupo = new Map<string, CasoDeLectura[]>();
  for (const caso of filtrados) porGrupo.set(caso.grupo, [...(porGrupo.get(caso.grupo) ?? []), caso]);
  const muestra: CasoDeLectura[] = [];
  for (let vuelta = 0; muestra.length < limite; vuelta++) {
    let agregados = 0;
    for (const delGrupo of porGrupo.values()) {
      const paso = Math.max(1, Math.floor(delGrupo.length / Math.ceil(limite / porGrupo.size)));
      const caso = delGrupo[vuelta * paso];
      if (caso && muestra.length < limite) agregados += muestra.push(caso) > 0 ? 1 : 0;
    }
    if (agregados === 0) break;
  }
  return muestra;
}

async function resultadosPrevios(detalle: string): Promise<Map<string, ResultadoDeLectura>> {
  const texto = await readFile(detalle, "utf8").catch(() => "");
  const previos = texto.split("\n").filter((linea) => linea.trim()).map((linea) => (JSON.parse(linea) as { resultado: ResultadoDeLectura }).resultado);
  return new Map(previos.filter((r) => !r.criterios.some((c) => c.nombre === "ejecucion")).map((r) => [r.id, r]));
}

async function enParalelo<T>(elementos: T[], concurrencia: number, tarea: (elemento: T) => Promise<void>): Promise<void> {
  const cola = [...elementos];
  const trabajador = async (): Promise<void> => {
    for (let elemento = cola.shift(); elemento !== undefined; elemento = cola.shift()) await tarea(elemento);
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrencia) }, trabajador));
}

async function cargarArchivo(ruta: string): Promise<Archivo> {
  const tipoMime = TIPOS_MIME[extname(ruta).toLowerCase()];
  if (!tipoMime) throw new Error(`Tipo de archivo no soportado: ${extname(ruta)}`);
  return { id: basename(ruta), nombre: basename(ruta), tipoMime, bytes: new Uint8Array(await readFile(ruta)) };
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
