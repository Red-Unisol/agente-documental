import { z } from "zod";
import type { UsoDelModelo } from "../dominio/costos/uso.js";
import type { Periodo } from "../dominio/tipos.js";
import type { Decision, Verificacion } from "../dominio/verificacion/verificar.js";
import type { Criterio } from "./graduar.js";

// Un caso del eval de lectura: un archivo tal como lo mandó una persona, la ficha con la que se lo
// compara y lo que se sabe de antemano de ese archivo. Los casos reales viven fuera del repositorio.
export const esquemaDeCasoDeLectura = z.object({
  id: z.string(),
  grupo: z.string(),
  archivo: z.string(),
  hoy: z.string(),
  ficha: z.object({
    negociacionId: z.string(),
    nombre: z.string(),
    dni: z.string(),
    provincia: z.string(),
    convenio: z.string(),
    sectorDeclarado: z.enum(["publico", "privado"]),
    empleadorDeclarado: z.string().optional(),
    situacionDeclarada: z.string().optional(),
  }),
  esperado: z.object({
    esRecibo: z.boolean(),
    // "2026-09". null cuando no hay referencia; `acuerdoDelPeriodo` dice cuántas fuentes la respaldan.
    periodo: z.string().nullable().default(null),
    acuerdoDelPeriodo: z.number().default(3),
    decision: z.enum(["aceptar", "pedir_de_nuevo", "derivar"]).optional(),
    decisionPorPeriodo: z.enum(["aceptar", "pedir_de_nuevo"]).optional(),
    identidad: z.enum(["coincide", "solo_dni", "otra_persona", "sin_identidad"]).optional(),
  }),
  rasgos: z
    .object({
      tipo: z.enum(["pdf", "imagen"]),
      paginas: z.number(),
      paquete: z.boolean(),
      liquidaciones: z.number(),
    })
    .partial()
    .default({}),
});

export type CasoDeLectura = z.infer<typeof esquemaDeCasoDeLectura>;

export interface LecturaObservada {
  esRecibo: boolean;
  periodo: Periodo | undefined;
  verificacion: Verificacion;
}

export interface ResultadoDeLectura {
  id: string;
  grupo: string;
  rasgos: CasoDeLectura["rasgos"];
  paso: boolean;
  criterios: Criterio[];
  decision: Decision;
  uso: UsoDelModelo;
  costoUsd: number | undefined;
  conSegundaLectura: boolean;
}

const REFERENCIA_CONFIABLE = 2;

export function decisionEsperada(esperado: CasoDeLectura["esperado"]): Decision | undefined {
  if (esperado.decision) return esperado.decision;
  if (!esperado.esRecibo) return "pedir_de_nuevo";
  if (esperado.identidad === "otra_persona") return "derivar";
  if (esperado.identidad === "sin_identidad" || esperado.acuerdoDelPeriodo < REFERENCIA_CONFIABLE) return undefined;
  return esperado.decisionPorPeriodo;
}

export function graduarLectura(caso: CasoDeLectura, observado: LecturaObservada): Criterio[] {
  const { esperado } = caso;
  const criterios: Criterio[] = [
    criterio("pertinencia", observado.esRecibo === esperado.esRecibo, `esperado ${siNo(esperado.esRecibo)}, leído ${siNo(observado.esRecibo)}`),
  ];
  if (!esperado.esRecibo) return [...criterios, ...criterioDeDecision(esperado, observado)];

  if (esperado.periodo && esperado.acuerdoDelPeriodo >= REFERENCIA_CONFIABLE) {
    const leido = observado.periodo ? `${observado.periodo.anio}-${String(observado.periodo.mes).padStart(2, "0")}` : "sin período";
    criterios.push(criterio("periodo", leido === esperado.periodo, `esperado ${esperado.periodo}, leído ${leido}`));
  }
  if (esperado.identidad && esperado.identidad !== "sin_identidad") {
    const identidad = observado.verificacion.chequeos.find((c) => c.nombre === "identidad");
    const debeCoincidir = esperado.identidad !== "otra_persona";
    criterios.push(criterio("identidad", identidad?.ok === debeCoincidir, identidad?.detalle ?? "no se evaluó"));
  }
  const empleador = observado.verificacion.chequeos.find((c) => c.nombre === "empleador");
  if (empleador) criterios.push(criterio("empleador", empleador.ok, empleador.detalle));
  return [...criterios, ...criterioDeDecision(esperado, observado)];
}

function criterioDeDecision(esperado: CasoDeLectura["esperado"], observado: LecturaObservada): Criterio[] {
  const decision = decisionEsperada(esperado);
  if (!decision) return [];
  return [criterio("decision", observado.verificacion.decision === decision, `esperada ${decision}, obtenida ${observado.verificacion.decision}`)];
}

function criterio(nombre: string, ok: boolean, detalle: string): Criterio {
  return { nombre, ok, detalle };
}

function siNo(valor: boolean): string {
  return valor ? "recibo" : "no es recibo";
}

// ── Informe: sólo agregados, sin datos de ninguna persona ───────────────────────────────────────

export function informeDeLecturas(resultados: ResultadoDeLectura[], modelo: string): string {
  const costos = resultados.map((r) => r.costoUsd);
  const costoTotal = costos.every((c) => c !== undefined) ? suma(costos as number[]) : undefined;
  const pasaron = resultados.filter((r) => r.paso).length;
  const nombresDeCriterio = [...new Set(resultados.flatMap((r) => r.criterios.map((c) => c.nombre)))];

  return [
    "# Eval de lectura de recibos",
    "",
    `Modelo de lectura: ${modelo} · ${resultados.length} documentos · ${pasaron} pasaron todos los criterios (${porcentaje(pasaron, resultados.length)})`,
    "",
    `Documentos que necesitaron segunda lectura: ${resultados.filter((r) => r.conSegundaLectura).length}`,
    "",
    "## Por criterio",
    "",
    tabla(
      ["criterio", "evaluados", "correctos", "%"],
      nombresDeCriterio.map((nombre) => {
        const evaluados = resultados.flatMap((r) => r.criterios.filter((c) => c.nombre === nombre));
        const correctos = evaluados.filter((c) => c.ok).length;
        return [nombre, evaluados.length, correctos, porcentaje(correctos, evaluados.length)];
      }),
    ),
    "",
    "## Por grupo",
    "",
    tablaDeGrupos(resultados, (r) => r.grupo),
    "",
    "## Por tipo de documento",
    "",
    tablaDeGrupos(resultados, tipoDeDocumento),
    "",
    "## Decisiones",
    "",
    tabla(["decisión", "documentos"], contar(resultados.map((r) => r.decision))),
    "",
    "## Costo y tiempo",
    "",
    tabla(
      ["", "valor"],
      [
        ["costo total", dolares(costoTotal)],
        ["costo por documento", dolares(costoTotal === undefined ? undefined : costoTotal / Math.max(resultados.length, 1), 5)],
        ["tokens de entrada por documento (mediana)", mediana(resultados.map((r) => r.uso.tokensDeEntrada))],
        ["tokens de entrada por documento (máximo)", Math.max(0, ...resultados.map((r) => r.uso.tokensDeEntrada))],
        ["tokens de salida por documento (mediana)", mediana(resultados.map((r) => r.uso.tokensDeSalida))],
        ["segundos por documento (mediana)", (mediana(resultados.map((r) => r.uso.milisegundos)) / 1000).toFixed(1)],
        ["segundos por documento (máximo)", (Math.max(0, ...resultados.map((r) => r.uso.milisegundos)) / 1000).toFixed(1)],
      ],
    ),
    "",
    "## Fallas por criterio y grupo",
    "",
    tabla(
      ["criterio", "grupo", "fallas"],
      contar(resultados.flatMap((r) => r.criterios.filter((c) => !c.ok).map((c) => `${c.nombre} | ${r.grupo}`))).map(([clave, n]) => [...String(clave).split(" | "), n]),
    ),
    "",
  ].join("\n");
}

function tipoDeDocumento(resultado: ResultadoDeLectura): string {
  const { tipo, paquete, liquidaciones } = resultado.rasgos;
  if (tipo === "imagen") return "foto";
  if (paquete) return "PDF con otros documentos adentro";
  if ((liquidaciones ?? 1) > 1) return "PDF con varias liquidaciones";
  return "PDF sólo con el recibo";
}

function tablaDeGrupos(resultados: ResultadoDeLectura[], grupoDe: (r: ResultadoDeLectura) => string): string {
  const grupos = [...new Set(resultados.map(grupoDe))].sort();
  return tabla(
    ["grupo", "documentos", "pasaron", "%", "costo por documento"],
    grupos.map((grupo) => {
      const delGrupo = resultados.filter((r) => grupoDe(r) === grupo);
      const pasaron = delGrupo.filter((r) => r.paso).length;
      const costos = delGrupo.map((r) => r.costoUsd);
      const costo = costos.every((c) => c !== undefined) ? suma(costos as number[]) / delGrupo.length : undefined;
      return [grupo, delGrupo.length, pasaron, porcentaje(pasaron, delGrupo.length), dolares(costo, 5)];
    }),
  );
}

function tabla(encabezado: string[], filas: (string | number)[][]): string {
  return [`| ${encabezado.join(" | ")} |`, `|${encabezado.map(() => "---").join("|")}|`, ...filas.map((fila) => `| ${fila.join(" | ")} |`)].join("\n");
}

function contar(valores: string[]): [string, number][] {
  const cuenta = new Map<string, number>();
  for (const valor of valores) cuenta.set(valor, (cuenta.get(valor) ?? 0) + 1);
  return [...cuenta.entries()].sort((a, b) => b[1] - a[1]);
}

function suma(valores: number[]): number {
  return valores.reduce((total, valor) => total + valor, 0);
}

function mediana(valores: number[]): number {
  if (valores.length === 0) return 0;
  const ordenados = [...valores].sort((a, b) => a - b);
  return ordenados[Math.floor(ordenados.length / 2)] ?? 0;
}

function porcentaje(parte: number, total: number): string {
  return total === 0 ? "—" : `${((100 * parte) / total).toFixed(1)} %`;
}

function dolares(usd: number | undefined, decimales = 4): string {
  return usd === undefined ? "sin tarifa" : `US$ ${usd.toFixed(decimales)}`;
}
